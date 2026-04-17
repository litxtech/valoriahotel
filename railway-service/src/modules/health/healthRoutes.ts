import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { ok: true, service: 'railway-service', ts: new Date().toISOString() };
  });
};

