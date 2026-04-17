import { hmacSha256Base64 } from '../../shared/utils/hmac.js';
import { Errors } from '../../shared/errors/appError.js';

export type GatewayResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

function stableJsonStringify(value: unknown): string {
  // For signature purposes we need deterministic output for our own requests.
  // This is NOT a general purpose canonicalizer; keep payload shape stable in code.
  return JSON.stringify(value ?? {});
}

export class GatewayClient {
  constructor(
    private readonly args: {
      baseUrl: string;
      sharedSecret: string;
      fetchImpl?: typeof fetch;
    }
  ) {}

  private sign(payload: unknown, method: string, path: string, ts: number) {
    const body = stableJsonStringify(payload);
    const message = `${ts}.${method.toUpperCase()}.${path}.${body}`;
    return { body, signature: hmacSha256Base64(this.args.sharedSecret, message) };
  }

  async post<T>(path: string, payload: unknown): Promise<GatewayResult<T>> {
    const ts = Date.now();
    const { body, signature } = this.sign(payload, 'POST', path, ts);
    const f = this.args.fetchImpl ?? fetch;

    const res = await f(`${this.args.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gw-ts': String(ts),
        'x-gw-signature': signature
      },
      body
    });

    const json = (await res.json().catch(() => null)) as GatewayResult<T> | null;
    if (!json) return { ok: false, error: { code: 'GATEWAY_INVALID_RESPONSE', message: 'Invalid gateway response' } };
    return json;
  }

  static throwIfError<T>(result: GatewayResult<T>): T {
    if (result.ok) return result.data;
    throw Errors.badRequest(result.error.message, { code: result.error.code, details: result.error.details });
  }
}

