import { defineConfig } from '@playwright/test'

const PORT = process.env.PORT ?? '3100'
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Block PWA service worker to prevent request interception/caching
    // during the smoke run (esp. tus POSTs to /api/upload).
    serviceWorkers: 'block',
  },
})
