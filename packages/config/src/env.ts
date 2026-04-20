import { z } from 'zod'

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
    REDIS_URL: z.string().startsWith('redis'),
    SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters (recommend 64 hex)'),
    PUBLIC_URL: z.string().url(),
    PORT: z.coerce.number().int().positive().default(3000),
    STORAGE_MODE: z.enum(['local', 's3']).default('local'),
    STORAGE_PATH: z.string().default('/data'),
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_BUCKET: z.string().optional(),
    STORAGE_S3_ACCESS_KEY: z.string().optional(),
    STORAGE_S3_SECRET_KEY: z.string().optional(),
    STORAGE_S3_REGION: z.string().default('us-east-1'),
    PUID: z.coerce.number().int().default(1000),
    PGID: z.coerce.number().int().default(1000),
    ADMIN_USER_EMAIL: z.string().optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    METRICS_ENABLED: z.coerce.boolean().default(false),
    TRUST_PROXY: z.coerce.boolean().default(true),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  })
  .transform((env) => ({
    ...env,
    ADMIN_USER_EMAILS: env.ADMIN_USER_EMAIL
      ? env.ADMIN_USER_EMAIL.split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : [],
  }))
  .superRefine((env, ctx) => {
    if (env.STORAGE_MODE === 's3') {
      for (const key of [
        'STORAGE_S3_ENDPOINT',
        'STORAGE_S3_BUCKET',
        'STORAGE_S3_ACCESS_KEY',
        'STORAGE_S3_SECRET_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when STORAGE_MODE=s3`,
          })
        }
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(input)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}
