import type {
  OfficialSubmissionProvider,
  ProviderCredentials,
  ProviderResponse,
  ProviderTestResponse,
  SubmitCheckInPayload,
  SubmitCheckOutPayload
} from './types.js';

export class HttpOfficialProvider implements OfficialSubmissionProvider {
  constructor(private readonly baseUrl: string) {}

  async submitCheckIn(_payload: SubmitCheckInPayload, _credentials: ProviderCredentials): Promise<ProviderResponse> {
    // TODO(real provider mapping required): implement HTTP call + payload mapping once official provider spec is known.
    throw new Error('TODO(real provider mapping required): submitCheckIn not implemented');
  }

  async submitCheckOut(_payload: SubmitCheckOutPayload, _credentials: ProviderCredentials): Promise<ProviderResponse> {
    // TODO(real provider mapping required): implement HTTP call + payload mapping once official provider spec is known.
    throw new Error('TODO(real provider mapping required): submitCheckOut not implemented');
  }

  async testConnection(_credentials: ProviderCredentials): Promise<ProviderTestResponse> {
    // TODO(real provider mapping required): implement provider test endpoint.
    return { ok: false, message: 'TODO(real provider mapping required): testConnection not implemented' };
  }
}

