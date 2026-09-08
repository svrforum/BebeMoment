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

describe('media knobs', () => {
  const base = {
    DATABASE_URL: 'postgres://localhost:5432/bebe',
    REDIS_URL: 'redis://localhost:6379',
    SECRET_KEY: STRONG,
    PUBLIC_URL: 'http://localhost:3000',
  }

  it('applies the documented defaults when unset', () => {
    const env = parseEnv(base)
    expect(env.MEDIA_ROLE).toBe('both')
    expect(env.MEDIA_HOST).toBe('0.0.0.0')
    expect(env.MEDIA_PORT).toBe(3001)
    expect(env.MEDIA_CONCURRENCY_THUMBNAIL).toBe(3)
    expect(env.MEDIA_CONCURRENCY_VIDEO).toBe(1)
    expect(env.MEDIA_FACES_CONCURRENCY).toBe(1)
    expect(env.MEDIA_SHUTDOWN_GRACE_MS).toBe(30_000)
    expect(env.MEDIA_MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024 * 1024)
    expect(env.MEDIA_FAMILY_QUOTA_BYTES).toBe(0)
    expect(env.MEDIA_MAX_INPUT_PIXELS).toBe(64_000_000)
    expect(env.MEDIA_STALE_UPLOAD_HOURS).toBe(6)
    expect(env.MEDIA_STALE_PROCESSING_HOURS).toBe(12)
    expect(env.MEDIA_DERIVATIVES_INCLUDE_AVIF).toBe(true)
    expect(env.MEDIA_AVIF_EFFORT).toBe(3)
    expect(env.MEDIA_VIPS_THREADS).toBeUndefined()
    expect(env.MEDIA_FFMPEG_THREADS).toBeUndefined()
    expect(env.MEDIA_URL_CACHE).toBe('on')
    expect(env.FACE_ML_URL).toBe('http://ml:8000')
  })

  it('coerces numeric strings and reads the enum/bool forms', () => {
    const env = parseEnv({
      ...base,
      MEDIA_ROLE: 'worker',
      MEDIA_PORT: '3101',
      MEDIA_CONCURRENCY_THUMBNAIL: '2',
      MEDIA_CONCURRENCY_VIDEO: '2',
      MEDIA_FACES_CONCURRENCY: '4',
      MEDIA_SHUTDOWN_GRACE_MS: '5000',
      MEDIA_MAX_UPLOAD_BYTES: '1048576',
      MEDIA_FAMILY_QUOTA_BYTES: '2048',
      MEDIA_MAX_INPUT_PIXELS: '32000000',
      MEDIA_STALE_UPLOAD_HOURS: '1',
      MEDIA_STALE_PROCESSING_HOURS: '2',
      MEDIA_DERIVATIVES_INCLUDE_AVIF: 'false',
      MEDIA_AVIF_EFFORT: '6',
      MEDIA_VIPS_THREADS: '2',
      MEDIA_FFMPEG_THREADS: '3',
      MEDIA_URL_CACHE: 'off',
      FACE_ML_URL: 'http://faces.internal:8000',
    })
    expect(env.MEDIA_ROLE).toBe('worker')
    expect(env.MEDIA_PORT).toBe(3101)
    expect(env.MEDIA_CONCURRENCY_THUMBNAIL).toBe(2)
    expect(env.MEDIA_CONCURRENCY_VIDEO).toBe(2)
    expect(env.MEDIA_FACES_CONCURRENCY).toBe(4)
    expect(env.MEDIA_SHUTDOWN_GRACE_MS).toBe(5000)
    expect(env.MEDIA_MAX_UPLOAD_BYTES).toBe(1_048_576)
    expect(env.MEDIA_FAMILY_QUOTA_BYTES).toBe(2048)
    expect(env.MEDIA_MAX_INPUT_PIXELS).toBe(32_000_000)
    expect(env.MEDIA_STALE_UPLOAD_HOURS).toBe(1)
    expect(env.MEDIA_STALE_PROCESSING_HOURS).toBe(2)
    expect(env.MEDIA_DERIVATIVES_INCLUDE_AVIF).toBe(false)
    expect(env.MEDIA_AVIF_EFFORT).toBe(6)
    expect(env.MEDIA_VIPS_THREADS).toBe(2)
    expect(env.MEDIA_FFMPEG_THREADS).toBe(3)
    expect(env.MEDIA_URL_CACHE).toBe('off')
    expect(env.FACE_ML_URL).toBe('http://faces.internal:8000')
  })

  it('treats empty strings as unset for the media knobs too', () => {
    const env = parseEnv({ ...base, MEDIA_CONCURRENCY_THUMBNAIL: '', MEDIA_ROLE: '' })
    expect(env.MEDIA_CONCURRENCY_THUMBNAIL).toBe(3)
    expect(env.MEDIA_ROLE).toBe('both')
  })

  it('rejects values that would silently misconfigure the media service', () => {
    expect(() => parseEnv({ ...base, MEDIA_ROLE: 'bogus' })).toThrow(/MEDIA_ROLE/)
    expect(() => parseEnv({ ...base, MEDIA_CONCURRENCY_VIDEO: '0' })).toThrow(
      /MEDIA_CONCURRENCY_VIDEO/,
    )
    expect(() => parseEnv({ ...base, MEDIA_CONCURRENCY_THUMBNAIL: 'abc' })).toThrow(
      /MEDIA_CONCURRENCY_THUMBNAIL/,
    )
    expect(() => parseEnv({ ...base, MEDIA_AVIF_EFFORT: '10' })).toThrow(/MEDIA_AVIF_EFFORT/)
    expect(() => parseEnv({ ...base, MEDIA_FAMILY_QUOTA_BYTES: '-1' })).toThrow(
      /MEDIA_FAMILY_QUOTA_BYTES/,
    )
  })
})
