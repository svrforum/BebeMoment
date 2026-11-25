import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { USES_TEST_DB, testFilesMatching } from '../../vitest.shared.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const INCLUDE = ['src/**/*.test.ts', 'src/**/*.test.tsx', 'app/**/*.test.ts', 'proxy.test.ts']

// DB 헬퍼를 쓰는 파일만 컨테이너(Postgres + valkey)가 있는 'db' 프로젝트로 간다. 나머지 'unit' 은
// globalSetup 이 없어 파일 하나를 돌려도 Docker 를 기다리지 않는다. 대신 unit 에는 접속 정보도
// Valkey 도 없어서, 분류에서 빠진 DB 테스트는 느려지는 게 아니라 깨진다 — 그래서 import 뿐 아니라
// 헬퍼 호출 자리도 본다(USES_TEST_DB).
const DB_TESTS = testFilesMatching(__dirname, INCLUDE, USES_TEST_DB)

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
  // tsconfig 의 jsx: preserve 는 Next 가 JSX 를 직접 컴파일하라는 뜻이다. 테스트에선 변환할 주체가
  // 없어 .tsx 를 못 읽으므로 여기서만 자동 런타임(react/jsx-runtime)으로 바꾼다.
  oxc: { jsx: { runtime: 'automatic' } },
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
