import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // globalSetup 이 메인 프로세스에서 컨테이너 1개를 띄우고 BEBE_TEST_PG_URL env 로
    // 모든 worker fork 에 상속시킴 → 파일마다 컨테이너 spin-up 사라짐 (test-db.ts 참조).
    globalSetup: ['./test-global-setup.ts'],
    pool: 'forks',
    maxWorkers: 4,
  },
})
