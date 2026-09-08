import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { DEFAULT_FEATURE_FLAGS } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getFeatureFlags, isFeatureEnabled } from './features'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
})

type Prisma = FullTestDb['prismaPublic']

// 쿼리 형상 검증 — 어떤 모델에 어떤 연산이 몇 번 나갔는지만 센다(DB 는 실제).
function countingClient(base: Prisma): { client: Prisma; ops: string[] } {
  const ops: string[] = []
  const client = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          ops.push(`${model}.${operation}`)
          return query(args)
        },
      },
    },
  }) as unknown as Prisma
  return { client, ops }
}

describe('getFeatureFlags', () => {
  it('아무것도 안 정하면 기본값, 저장된 값은 덮어쓴다', async () => {
    expect(await getFeatureFlags(db.prismaPublic)).toEqual(DEFAULT_FEATURE_FLAGS)
    await db.prismaPublic.appSetting.createMany({
      data: [
        { key: 'features.faces', value: true },
        { key: 'features.likes', value: false },
        // boolean 이 아닌 저장값은 무시 → 기본값
        { key: 'features.albums', value: 'yes' },
      ],
    })
    expect(await getFeatureFlags(db.prismaPublic)).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      faces: true,
      likes: false,
    })
  })

  it('플래그 7개를 한 번의 findMany 로 읽는다', async () => {
    const { client, ops } = countingClient(db.prismaPublic)
    await getFeatureFlags(client)
    expect(ops).toEqual(['AppSetting.findMany'])
  })

  it('isFeatureEnabled 는 같은 읽기를 재사용한다', async () => {
    await db.prismaPublic.appSetting.create({ data: { key: 'features.faces', value: true } })
    const { client, ops } = countingClient(db.prismaPublic)
    expect(await isFeatureEnabled('faces', client)).toBe(true)
    expect(await isFeatureEnabled('likes', client)).toBe(true)
    expect(ops).toEqual(['AppSetting.findMany', 'AppSetting.findMany'])
  })
})
