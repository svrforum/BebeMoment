import { type Env, parseEnv } from '@bebe/config'

export function getEnv(): Env {
  return parseEnv(process.env as Record<string, string | undefined>)
}
