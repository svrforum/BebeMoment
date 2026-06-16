import { z } from 'zod'

// z.coerce.boolean() 은 비어있지 않은 모든 문자열을 true 로 만든다 — "false"·"0" 도 true.
// env 로 끄는 걸 가능하게 하려면 문자열을 직접 해석한다(미설정/빈값은 기본값).
const envBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return def
      return v.trim().toLowerCase() === 'true' || v.trim() === '1'
    })

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
    DATABASE_URL_WEB: z.string().url().or(z.string().startsWith('postgres')).optional(),
    DATABASE_URL_MEDIA: z.string().url().or(z.string().startsWith('postgres')).optional(),
    REDIS_URL: z.string().startsWith('redis'),
    SECRET_KEY: z.string().min(32, 'SECRET_KEY must be at least 32 characters (recommend 64 hex)'),
    PUBLIC_URL: z.string().url(),
    MEDIA_INTERNAL_URL: z.string().url().optional(),
    MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_MEDIA_BASE_URL: z.string().url().optional(),
    MEDIA_SERVICE_TOKEN: z.string().min(32).optional(),
    MEDIA_JWT_SECRET: z.string().min(32).optional(),
    BEBE_WEB_DB_PASSWORD: z.string().min(8).optional(),
    BEBE_MEDIA_DB_PASSWORD: z.string().min(8).optional(),
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
    METRICS_ENABLED: envBool(false),
    TRUST_PROXY: envBool(true),
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
  // 빈 문자열 env 는 "미설정"으로 취급한다. compose 가 `${VAR:-}` 로 빈값을 넘기면
  // optional().url()·enum 등이 '' 를 거부해 부팅이 깨졌다(미설정이면 통과/기본값 적용).
  const cleaned: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(input)) cleaned[key] = value === '' ? undefined : value
  const result = EnvSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${issues}`)
  }
  return result.data
}
