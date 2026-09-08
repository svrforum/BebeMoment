import { defineConfig } from 'vitest/config'
export default defineConfig({
  // 통합 테스트가 valkey 컨테이너를 띄운다(queue.integration.test.ts) — 이미지 pull 이
  // 처음이면 몇 초~수십 초. Docker 가 없으면 그 파일은 skip 된다.
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 180_000 },
})
