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
    // 각 fork 는 자체 testcontainers postgres 를 띄움 (완전 격리). 1 → 4 로 늘려
    // 245 테스트의 container 스핀업·실행을 병렬화 — wall time 약 4배 단축.
    // ubuntu-latest 러너 (4 vCPU / 7GB RAM) 에서 postgres 컨테이너 4개 충분.
    pool: 'forks',
    maxWorkers: 4,
  },
})
