import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
process.env.REDIS_URL ??= 'redis://localhost:6379'
process.env.SECRET_KEY ??= 'test-secret-key-at-least-32-chars!'
process.env.PUBLIC_URL ??= 'http://localhost:3000'
process.env.STORAGE_PATH ??= fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-test-'))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      SECRET_KEY: process.env.SECRET_KEY,
      PUBLIC_URL: process.env.PUBLIC_URL,
      STORAGE_PATH: process.env.STORAGE_PATH,
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
