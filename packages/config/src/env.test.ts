import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

// realistic strong key (64 hex, high distinct-char count) — not a placeholder, passes the guard
const STRONG = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

describe('parseEnv', () => {
  it('parses required env vars', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: STRONG,
      PUBLIC_URL: 'http://localhost:3000',
    })
    expect(env.DATABASE_URL).toBe('postgres://localhost:5432/bebe')
    expect(env.PORT).toBe(3000)
    expect(env.STORAGE_MODE).toBe('local')
  })

  it('treats empty-string env vars as unset (compose VAR:- default passes empty)', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: STRONG,
      PUBLIC_URL: 'http://localhost:3000',
      // compose 가 미설정 기본값으로 넘기는 빈 문자열 — '' 가 url()/enum 을 깨지 않아야 한다.
      MEDIA_PUBLIC_BASE_URL: '',
      NEXT_PUBLIC_MEDIA_BASE_URL: '',
      LOG_LEVEL: '',
      ADMIN_USER_EMAIL: '',
    })
    expect(env.MEDIA_PUBLIC_BASE_URL).toBeUndefined()
    expect(env.NEXT_PUBLIC_MEDIA_BASE_URL).toBeUndefined()
    expect(env.LOG_LEVEL).toBe('info') // 기본값 적용
    expect(env.ADMIN_USER_EMAILS).toEqual([])
  })

  it('rejects SECRET_KEY that is too short', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost:5432/bebe',
        REDIS_URL: 'redis://localhost:6379',
        SECRET_KEY: 'short',
        PUBLIC_URL: 'http://localhost:3000',
      }),
    ).toThrow(/SECRET_KEY/)
  })

  it('parses comma-separated admin emails', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: STRONG,
      PUBLIC_URL: 'http://localhost:3000',
      ADMIN_USER_EMAIL: 'a@b.com, c@d.com',
    })
    expect(env.ADMIN_USER_EMAILS).toEqual(['a@b.com', 'c@d.com'])
  })

  it('requires S3 env when STORAGE_MODE=s3', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost:5432/bebe',
        REDIS_URL: 'redis://localhost:6379',
        SECRET_KEY: STRONG,
        PUBLIC_URL: 'http://localhost:3000',
        STORAGE_MODE: 's3',
      }),
    ).toThrow(/STORAGE_S3_/)
  })

  it('accepts DATABASE_URL_WEB and DATABASE_URL_MEDIA', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://bebe:bebe@localhost:5432/bebe',
      DATABASE_URL_WEB: 'postgres://bebe_web:webpw@localhost:5432/bebe',
      DATABASE_URL_MEDIA: 'postgres://bebe_media:mediapw@localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: STRONG,
      PUBLIC_URL: 'http://localhost:3000',
    })
    expect(env.DATABASE_URL_WEB).toBe('postgres://bebe_web:webpw@localhost:5432/bebe')
    expect(env.DATABASE_URL_MEDIA).toBe('postgres://bebe_media:mediapw@localhost:5432/bebe')
  })

  it('rejects MEDIA_SERVICE_TOKEN that is too short', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost:5432/bebe',
        REDIS_URL: 'redis://localhost:6379',
        SECRET_KEY: STRONG,
        PUBLIC_URL: 'http://localhost:3000',
        MEDIA_SERVICE_TOKEN: 'too-short',
      }),
    ).toThrow(/MEDIA_SERVICE_TOKEN/)
  })

  it('accepts media service env when provided together', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://localhost:5432/bebe',
      REDIS_URL: 'redis://localhost:6379',
      SECRET_KEY: STRONG,
      PUBLIC_URL: 'http://localhost:3000',
      MEDIA_INTERNAL_URL: 'http://media:3001',
      MEDIA_PUBLIC_BASE_URL: 'https://bebe.example.com',
      NEXT_PUBLIC_MEDIA_BASE_URL: 'https://bebe.example.com',
      MEDIA_SERVICE_TOKEN: 's'.repeat(40),
      MEDIA_JWT_SECRET: 'j'.repeat(40),
      BEBE_WEB_DB_PASSWORD: 'webpassword',
      BEBE_MEDIA_DB_PASSWORD: 'mediapassword',
    })
    expect(env.MEDIA_INTERNAL_URL).toBe('http://media:3001')
    expect(env.MEDIA_SERVICE_TOKEN).toHaveLength(40)
    expect(env.BEBE_WEB_DB_PASSWORD).toBe('webpassword')
  })

  // the placeholder/entropy guard only fires in production
  const base = {
    DATABASE_URL: 'postgres://localhost:5432/bebe',
    REDIS_URL: 'redis://localhost:6379',
    PUBLIC_URL: 'http://localhost:3000',
    NODE_ENV: 'production',
  }

  it('allows a placeholder SECRET_KEY in development (local workflow preserved)', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'development',
      SECRET_KEY: 'dev_secret_key_at_least_32_bytes_long_change_me',
    })
    expect(env.SECRET_KEY).toContain('dev_secret')
  })

  it('rejects a placeholder SECRET_KEY (the .env.example values that pass min length)', () => {
    // root .env.example value — 47 chars, passes min(32) but is publicly known
    expect(() =>
      parseEnv({ ...base, SECRET_KEY: 'dev_secret_key_at_least_32_bytes_long_change_me' }),
    ).toThrow(/SECRET_KEY/)
    // compose/.env.example value
    expect(() =>
      parseEnv({ ...base, SECRET_KEY: 'change-me-to-32-plus-random-bytes-64-hex-recommended' }),
    ).toThrow(/SECRET_KEY/)
  })

  it('rejects a low-entropy SECRET_KEY (repeated characters)', () => {
    expect(() => parseEnv({ ...base, SECRET_KEY: 'a'.repeat(64) })).toThrow(/SECRET_KEY/)
  })

  it('rejects a placeholder MEDIA_SERVICE_TOKEN / MEDIA_JWT_SECRET', () => {
    expect(() =>
      parseEnv({
        ...base,
        SECRET_KEY: STRONG,
        MEDIA_SERVICE_TOKEN: 'dev_media_service_token_at_least_32_bytes_____',
      }),
    ).toThrow(/MEDIA_SERVICE_TOKEN/)
    expect(() =>
      parseEnv({
        ...base,
        SECRET_KEY: STRONG,
        MEDIA_JWT_SECRET: 'dev_media_jwt_secret_at_least_32_bytes________',
      }),
    ).toThrow(/MEDIA_JWT_SECRET/)
  })
})
