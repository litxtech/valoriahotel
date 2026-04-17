import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { loadEnv } from '../config/env.js';
import { createLoggerOptions } from '../shared/logger/logger.js';
import { createSupabaseServerClient } from '../integrations/supabase/serverClient.js';
import { gatewayRoutes } from '../modules/gateway/gatewayRoutes.js';

declare module 'fastify' {
  interface FastifyInstance {
    env: ReturnType<typeof loadEnv>;
    supabase: ReturnType<typeof createSupabaseServerClient>;
  }
}

export function buildApp() {
  const env = loadEnv();
  const app = Fastify({ logger: createLoggerOptions(env) });
  app.decorate('env', env);
  app.decorate('supabase', createSupabaseServerClient(env));

  app.register(sensible);
  app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });

  app.get('/gateway/health', async () => ({ ok: true, service: 'kbs-gateway-service', ts: new Date().toISOString() }));
  app.register(gatewayRoutes, { prefix: '/' });

  return app;
}

