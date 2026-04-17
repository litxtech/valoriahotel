import pino from 'pino';
import type { Env } from '../../config/env.js';

export function createLoggerOptions(env: Env): pino.LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-gateway-shared-secret', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]'
    }
  };
}

