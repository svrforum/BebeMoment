import { configDefaults, defineConfig } from 'vitest/config'
import { USES_TEST_DB, testFilesMatching } from '../../vitest.shared.mjs'

const INCLUDE = ['src/**/*.test.ts']
// startTestDb() 를 쓰는 파일만 컨테이너가 있는 'db' 프로젝트로 — 나머지는 Docker 없이 돈다.
const DB_TESTS = testFilesMatching(import.meta.dirname, INCLUDE, USES_TEST_DB)

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
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
          // 컨테이너·템플릿 DB 는 web·media 와 같은 것을 쓴다(@bebe/db-media 쪽에 둔 이유: media
          // 앱은 db-public 에 의존하지 않는다).
          globalSetup: ['../db-media/src/test-global-setup.ts'],
        },
      },
    ],
  },
})
