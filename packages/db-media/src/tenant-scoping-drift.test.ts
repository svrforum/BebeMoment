import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MODELS_WITH_FAMILY_ID_COLUMN, TENANT_SCOPED_MODELS } from './tenant-middleware'

// db-public 의 drift 가드와 동형(보안감사 2026-06 권고). media 스키마에 familyId 컬럼을 가진
// 모델이 새로 추가됐는데 tenant-middleware 의 집합에 빠지면 격리 안전망에서 누락 — 빌드타임 차단.
describe('media tenant scoping drift guard', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
  const familyIdModels = [...schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)]
    .filter((m) => /^\s*familyId\s/m.test(m[2] ?? ''))
    .map((m) => m[1] as string)

  it('finds the familyId-bearing media models', () => {
    expect(familyIdModels.length).toBeGreaterThanOrEqual(3)
    expect(familyIdModels).toContain('Asset')
  })

  it('every familyId-bearing model is in both tenant sets', () => {
    const missingScoped = familyIdModels.filter((m) => !TENANT_SCOPED_MODELS.has(m))
    const missingColumn = familyIdModels.filter((m) => !MODELS_WITH_FAMILY_ID_COLUMN.has(m))
    expect(
      missingScoped,
      `media models with familyId missing from TENANT_SCOPED_MODELS: ${missingScoped}`,
    ).toEqual([])
    expect(
      missingColumn,
      `media models with familyId missing from MODELS_WITH_FAMILY_ID_COLUMN: ${missingColumn}`,
    ).toEqual([])
  })
})
