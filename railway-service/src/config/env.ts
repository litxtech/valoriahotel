import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  APP_ENV: z.enum(['local', 'staging', 'prod']).default('local'),

  GATEWAY_BASE_URL: z.string().url(),
  GATEWAY_SHARED_SECRET: z.string().min(16),

  KBS_CREDENTIAL_SECRET: z.string().min(16),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    // Do not log secrets; zod output may contain values.
    throw new Error(`Invalid env: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
  }
  return parsed.data;
}

