import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Errors } from '../../shared/errors/appError.js';
import type { AuthContext } from '../../shared/security/authTypes.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const HeaderSchema = z.object({
  authorization: z.string().optional()
});

/**
 * Auth strategy:
 * - Verify Supabase JWT using the service client (getUser).
 * - Resolve ops.app_users row for hotel scope and role.
 *
 * NOTE: This is the enforcement point; UI must never receive service role keys.
 */
export const authPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', async (req) => {
    const headers = HeaderSchema.safeParse(req.headers);
    if (!headers.success) throw Errors.unauthorized();
    const bearer = headers.data.authorization;
    if (!bearer || !bearer.toLowerCase().startsWith('bearer ')) throw Errors.unauthorized('Missing bearer token');
    const token = bearer.slice('bearer '.length).trim();
    if (!token) throw Errors.unauthorized('Missing bearer token');

    const { data: userData, error: userErr } = await app.supabase.auth.getUser(token);
    if (userErr || !userData.user) throw Errors.unauthorized('Invalid token');

    const authUserId = userData.user.id;

    const { data: appUser, error: appUserErr } = await app.supabase
      .schema('ops')
      .from('app_users')
      .select('id, hotel_id, role, is_active')
      .eq('id', authUserId)
      .maybeSingle();

    if (appUserErr) throw Errors.unauthorized('User not provisioned');
    if (!appUser || appUser.is_active === false) throw Errors.forbidden('User inactive');

    req.auth = {
      authUserId,
      hotelId: appUser.hotel_id,
      role: appUser.role
    } as AuthContext;
  });
};

