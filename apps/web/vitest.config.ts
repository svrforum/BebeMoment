import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { testFilesMatching } from '../../vitest.shared.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const INCLUDE = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'app/**/*.test.ts', 'proxy.test.ts']

// DB 헬퍼를 import 하는 파일만 컨테이너(Postgres + valkey)가 있는 'db' 프로젝트로 간다. 나머지
// 'unit' 은 globalSetup 이 없어 파일 하나를 돌려도 Docker 를 기다리지 않는다. 걸러지지 않은
// DB 테스트가 생겨도 startTestDb() 가 자체 컨테이너로 폴백하므로 느려질 뿐 깨지지는 않는다.
const DB_TESTS = testFilesMatching(
  __dirname,
  INCLUDE,
  /['"](?:@\/test-support\/db|@bebe\/db-(?:public|media)\/src\/test-db)['"]/,
)

// 셸에 남은 접속 정보로 테스트가 다른(운영일 수 있는) DB·Redis 에 붙지 않게 지운다. 필요한
// 테스트는 db 프로젝트의 globalSetup 이 띄운 컨테이너 주소를 받는다.
for (const key of ['DATABASE_URL', 'DATABASE_URL_WEB', 'DATABASE_URL_MEDIA', 'REDIS_URL']) {
  delete process.env[key]
}

export default defineConfig({
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  test: {
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: INCLUDE,
          exclude: [...configDefaults.exclude, ...DB_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: DB_TESTS,
          // 실행 하나에 컨테이너 하나 — 각 파일은 마이그레이션된 템플릿 DB 를 복제해 쓴다.
          globalSetup: [
            '@bebe/db-media/src/test-global-setup.ts',
            '@bebe/queue/src/test-global-setup.ts',
          ],
        },
      },
    ],
  },
})
