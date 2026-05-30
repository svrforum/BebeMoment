import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODELS_WITH_FAMILY_ID_COLUMN, TENANT_SCOPED_MODELS } from './tenant-middleware'

// journal→story 리네임 때 tenant-middleware 의 모델 집합이 갱신 안 돼 Story 전체가
// 격리 안전망에서 빠졌던 회귀(2026-05-30 코드리뷰)를 막는 빌드타임 가드. schema 에
// familyId 컬럼을 가진 모델은 반드시 두 집합에 들어 있어야 한다.
describe('tenant scoping drift guard', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  const familyIdModels = [...schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)]
    .filter((m) => /^\s*familyId\s/m.test(m[2] ?? ''))
    .map((m) => m[1] as string)

  it('finds the familyId-bearing models', () => {
    // sanity: the regex actually matched something (schema present, parseable)
    expect(familyIdModels.length).toBeGreaterThan(5)
    expect(familyIdModels).toContain('Story')
  })

  it('every familyId-bearing model is in TENANT_SCOPED_MODELS and MODELS_WITH_FAMILY_ID_COLUMN', () => {
    const missingScoped = familyIdModels.filter((m) => !TENANT_SCOPED_MODELS.has(m))
    const missingColumn = familyIdModels.filter((m) => !MODELS_WITH_FAMILY_ID_COLUMN.has(m))
    expect(
      missingScoped,
      `models with familyId missing from TENANT_SCOPED_MODELS: ${missingScoped}`,
    ).toEqual([])
    expect(
      missingColumn,
      `models with familyId missing from MODELS_WITH_FAMILY_ID_COLUMN: ${missingColumn}`,
    ).toEqual([])
  })
})
