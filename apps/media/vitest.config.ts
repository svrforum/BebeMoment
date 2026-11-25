import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'
import { USES_TEST_DB, testFilesMatching } from '../../vitest.shared.mjs'

// getEnv() 가 요구하는 접속 정보는 **아무 데도 닿지 않는 주소**로 고정한다(셸 값도 무시). 예전
// 기본값 localhost:6379·5432 는 개발 머신에서 운영 Redis·Postgres 일 수 있었고, buildApp() 이
// 만드는 BullMQ 큐가 거기에 붙었다. 실제로 필요한 테스트는 integration 프로젝트의 globalSetup 이
// 띄운 컨테이너 주소로 REDIS_URL 을 덮어쓰고, DB 테스트는 startTestDb() 의 url 을 직접 넣는다.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/test'
process.env.REDIS_URL = 'redis://127.0.0.1:1'
delete process.env.DATABASE_URL_MEDIA
process.env.SECRET_KEY ??= 'test-secret-key-at-least-32-chars!'
process.env.PUBLIC_URL ??= 'http://localhost:3000'
process.env.STORAGE_PATH ??= fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-test-'))

const INCLUDE = ['src/**/*.test.ts']

// DB 헬퍼나 buildApp()(라우트 등록 때 BullMQ 큐를 만든다)을 쓰는 파일만 컨테이너가 있는
// 'integration' 으로 간다. 나머지 'unit' 은 파일 하나를 돌려도 Docker 를 기다리지 않는다.
const INTEGRATION_TESTS = testFilesMatching(
  import.meta.dirname,
  INCLUDE,
  new RegExp(`${USES_TEST_DB.source}|['"]@/server['"]`),
)

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // 값은 위에서 process.env 에 넣었고 worker 가 그대로 물려받는다. 여기 `env` 에 REDIS_URL 을
    // 두면 globalSetup 이 바꾼 컨테이너 주소를 덮어쓰므로 두지 않는다.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: INCLUDE,
          exclude: [...configDefaults.exclude, ...INTEGRATION_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: INTEGRATION_TESTS,
          globalSetup: [
            '@bebe/db-media/src/test-global-setup.ts',
            '@bebe/queue/src/test-global-setup.ts',
          ],
        },
      },
    ],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
})
