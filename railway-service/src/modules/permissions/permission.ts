import { Errors } from '../../shared/errors/appError.js';
import type { AuthContext } from '../../shared/security/authTypes.js';

export function assertHasPermission(result: boolean, code: string, ctx: AuthContext) {
  if (ctx.role === 'admin') return;
  if (!result) throw Errors.forbidden(`Missing permission: ${code}`);
}

