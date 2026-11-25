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
        test: { name: 'db', include: DB_TESTS, globalSetup: ['./src/test-global-setup.ts'] },
      },
    ],
  },
})
