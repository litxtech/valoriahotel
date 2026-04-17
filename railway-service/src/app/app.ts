import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from '../config/env.js';
import { createLoggerOptions } from '../shared/logger/logger.js';
import { createSupabaseServerClient } from '../integrations/supabase/serverClient.js';
import { authPlugin } from '../modules/auth/authPlugin.js';
import { healthRoutes } from '../modules/health/healthRoutes.js';
import { AppError, Errors } from '../shared/errors/appError.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: ReturnType<typeof loadEnv>;
    supabase: ReturnType<typeof createSupabaseServerClient>;
  }
}

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({
    logger: createLoggerOptions(env)
  });

  app.decorate('env', env);
  app.decorate('supabase', createSupabaseServerClient(env));

  app.register(sensible);
  app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    const e = err as unknown;
    if (e instanceof AppError) {
      reply.status(e.statusCode).send({ ok: false, error: { code: e.code, message: e.message, details: e.details } });
      return;
    }
    req.log.error({ err }, 'unhandled_error');
    const fallback = Errors.internal();
    reply.status(fallback.statusCode).send({ ok: false, error: { code: fallback.code, message: fallback.message } });
  });

  // Public routes
  app.register(healthRoutes, { prefix: '/' });

  // Protected routes (all require auth for now)
  app.register(async (protectedScope) => {
    protectedScope.register(authPlugin);
    const { submissionsRoutes } = await import('../modules/submissions/submissionsRoutes.js');
    protectedScope.register(submissionsRoutes, { prefix: '/' });
    const { checkoutRoutes } = await import('../modules/checkout/checkoutRoutes.js');
    protectedScope.register(checkoutRoutes, { prefix: '/' });
    const { documentsRoutes } = await import('../modules/documents/documentsRoutes.js');
    protectedScope.register(documentsRoutes, { prefix: '/' });
    const { adminKbsSettingsRoutes } = await import('../modules/admin/adminKbsSettingsRoutes.js');
    protectedScope.register(adminKbsSettingsRoutes, { prefix: '/' });
    const { adminPermissionsRoutes } = await import('../modules/admin/adminPermissionsRoutes.js');
    protectedScope.register(adminPermissionsRoutes, { prefix: '/' });
  });

  return app;
}

