import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestDb, startTestDb } from './test-db'

// 마이그레이션은 손으로 쓴 SQL 이다(cross-schema FK 때문에 migrate dev 를 못 쓴다). 그래서
// schema.prisma 와 어긋나도 그 컬럼을 건드리는 테스트가 없으면 아무도 모르고, 생성된 클라이언트는
// schema.prisma 를 믿으므로 운영에서 처음 터진다. 마이그레이션을 적용한 DB 와 두 schema.prisma 의
// 차이를 Prisma 에게 직접 묻는다.
//
// 패키지별로 따로 물을 수 없다: 한 스키마만 introspect 하면 다른 스키마를 가리키는 FK 때문에
// Prisma 가 P4002 로 거절한다. 그래서 두 파일의 모델을 합쳐 schemas = [public, media] 인 임시
// datamodel 을 만들고 거기에 대고 비교한다. 두 schema.prisma 는 서로의 모델을 모르므로 스키마를
// 넘는 FK 는 datamodel 에 없다 — DB 에서 그 목록을 읽어 해당 DROP CONSTRAINT 만 걸러 낸다.
//
// 이 가드를 만들 때 이미 차이가 있었다(이름만 다른 인덱스·제약, timestamptz, Prisma 가 표현 못 하는
// 인덱스 등). 그 목록을 migration-drift.known.sql 에 적어 두고 **정확히 같은지** 본다 — 새 차이가
// 생기면 실패하고, 고쳐서 사라진 차이도 파일에서 지우라고 실패한다.

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SCHEMA_FILES = [
  'packages/db-public/prisma/schema.prisma',
  'packages/db-media/prisma/schema.prisma',
]
const PRISMA_CLI = path.join(REPO_ROOT, 'packages/db-media/node_modules/prisma/build/index.js')

/** generator·datasource 블록을 뺀 나머지(모델·enum). 블록은 줄 맨 앞에서 시작해 `}` 로 닫힌다. */
function modelsOnly(schema: string): string {
  return schema.replace(/^(generator|datasource)\s+\w+\s*\{[\s\S]*?^\}\s*$/gm, '')
}

function combinedDatamodel(): string {
  const models = SCHEMA_FILES.map((f) => modelsOnly(readFileSync(path.join(REPO_ROOT, f), 'utf8')))
  return [
    'datasource db {\n  provider = "postgresql"\n  schemas  = ["public", "media"]\n}',
    ...models,
  ].join('\n\n')
}

function runPrisma(
  args: string[],
  databaseUrl: string,
): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PRISMA_CLI, ...args], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        CHECKPOINT_DISABLE: '1',
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      out += d
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve({ code, out }))
  })
}

const KNOWN_HEADER = `-- 마이그레이션을 적용한 DB 와 schema.prisma(public + media)의 차이 지문. prisma migrate diff 가 낸
-- 문장을 한 줄로 펴서 정렬했다 — 순서가 바뀌었으니 실행할 수 있는 SQL 이 아니다.
-- migration-drift.test.ts 가 만들고 비교한다. 손으로 고치지 말 것.
-- 줄이 늘었다 = 마이그레이션과 schema.prisma 가 새로 어긋났다 → 둘 중 하나를 고친다.
-- 줄이 줄었다 = 차이를 고쳤다 → pnpm --filter @bebe/db-media exec vitest run src/migration-drift.test.ts -u
-- Prisma 를 올린 뒤 깨졌다 = 출력 모양만 바뀌었을 수도, 새 차이가 섞였을 수도 있다. -u 는 무엇이든
-- 검토 없이 새 기준으로 삼으므로, 먼저 실패 출력의 diff 를 줄마다 보고 새 차이가 없을 때만 -u 한다.
-- 스키마를 넘는 FK(모델이 서로를 모른다)의 DROP CONSTRAINT 는 테스트가 미리 걸러 낸다.

`

/** --script 출력의 SQL 문들(주석·빈 줄 제외, 공백 한 칸으로 정규화). */
function statements(script: string): string[] {
  return script
    .split('\n')
    .filter((l) => !l.startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0 && !/^Loaded Prisma config/.test(s))
}

describe('migrations match schema.prisma (db-public + db-media)', () => {
  let db: TestDb
  let dir: string
  beforeAll(async () => {
    db = await startTestDb()
    dir = mkdtempSync(path.join(os.tmpdir(), 'bebe-drift-'))
  }, 180_000)
  afterAll(async () => {
    await db?.stop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads every model from both schema files', () => {
    const dm = combinedDatamodel()
    expect(dm).not.toMatch(/^generator /m)
    expect(dm.match(/^datasource /gm)).toHaveLength(1)
    expect(dm).toMatch(/^model Asset \{/m)
    expect(dm).toMatch(/^model User \{/m)
  })

  it('prisma migrate diff from the migrated database to schema.prisma matches the known list', async () => {
    const schemaPath = path.join(dir, 'schema.prisma')
    const configPath = path.join(dir, 'prisma.config.mjs')
    writeFileSync(schemaPath, combinedDatamodel())
    writeFileSync(
      configPath,
      `export default { schema: ${JSON.stringify(schemaPath)}, datasource: { url: process.env.DATABASE_URL } }\n`,
    )

    const { code, out } = await runPrisma(
      [
        'migrate',
        'diff',
        '--config',
        configPath,
        '--from-config-datasource',
        '--to-schema',
        schemaPath,
        '--script',
        '--exit-code',
      ],
      db.url,
    )
    // --exit-code: 0 = 차이 없음, 2 = 차이 있음(out 이 그 SQL), 1 = 실행 오류.
    expect(code, out).not.toBe(1)

    const crossSchemaFks = await db.prisma.$queryRawUnsafe<
      Array<{ schema: string; tbl: string; name: string }>
    >(`
      SELECT rn.nspname AS schema, r.relname AS tbl, c.conname AS name
      FROM pg_constraint c
      JOIN pg_class r ON r.oid = c.conrelid
      JOIN pg_namespace rn ON rn.oid = r.relnamespace
      JOIN pg_class f ON f.oid = c.confrelid
      JOIN pg_namespace fn ON fn.oid = f.relnamespace
      WHERE c.contype = 'f' AND rn.nspname <> fn.nspname
    `)
    expect(
      crossSchemaFks.length,
      '스키마를 넘는 FK 가 하나도 안 읽혔다 — 쿼리가 틀렸다',
    ).toBeGreaterThan(0)
    // Prisma 는 기본 스키마(public)의 테이블 이름에는 스키마를 붙이지 않는다.
    const expectedDrops = new Set(
      crossSchemaFks.map((fk) => {
        const table = fk.schema === 'public' ? `"${fk.tbl}"` : `"${fk.schema}"."${fk.tbl}"`
        return `ALTER TABLE ${table} DROP CONSTRAINT "${fk.name}"`
      }),
    )
    const all = statements(out)
    // 전부가 나오지는 않는다(asset_babies → babies 는 Prisma 가 지우자고 하지 않는다). 모양이 맞는지만 본다.
    expect(
      all.some((s) => expectedDrops.has(s)),
      '스키마를 넘는 FK 를 걸러 내는 문장 모양이 Prisma 출력과 어긋난다',
    ).toBe(true)

    const drift = all.filter((s) => !expectedDrops.has(s)).sort()
    await expect(
      `${KNOWN_HEADER}${drift.map((s) => `${s};`).join('\n')}\n`,
      'schema.prisma 와 마이그레이션 SQL 의 차이가 알려진 목록과 다르다. 늘었다면 마이그레이션이나 ' +
        'schema.prisma 를 고친다. 줄었다면(고쳤다면) -u 로 이 파일을 갱신한다.',
    ).toMatchFileSnapshot('./migration-drift.known.sql')
  }, 120_000)
})
