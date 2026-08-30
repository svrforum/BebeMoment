import { describe, expect, it } from 'vitest'
import { createStoryEntry } from './create'

// 스토리에 넣을 수 있는 사진 수에 상한을 두지 않는다. 예전엔 10장에서 잘렸는데, 그
// 숫자를 서버·편집 화면·업로드 시트가 각자 들고 있었고 시트만 빠져서 사진을 다 올린
// 뒤에야 400 이 났다. 상한을 없앤 이상, 슬그머니 되돌아오지 않게 여기서 못 박는다.
const noDb = null as never

function payload(n: number) {
  return {
    familyId: '11111111-1111-1111-1111-111111111111',
    babyId: null,
    entryDate: '2026-08-30',
    body: 'x',
    byUserId: '33333333-3333-3333-3333-333333333333',
    assetIds: Array.from(
      { length: n },
      (_, i) => `22222222-2222-2222-2222-${String(i).padStart(12, '0')}`,
    ),
  }
}

/** zod 검증을 통과했는지 — 통과하면 그다음 DB 단계(noDb)에서 다른 이유로 터진다. */
async function validationError(n: number): Promise<string> {
  const err = await createStoryEntry(payload(n), noDb, noDb).catch((e: Error) => e)
  return String(err)
}

describe('createStoryEntry 사진 수 검증', () => {
  it('사진이 0장이면 거절한다 — 스토리는 최소 1장', async () => {
    expect(await validationError(0)).toContain('사진을 최소 1장')
  })

  it('50장도 검증을 통과한다 — 상한 없음', async () => {
    expect(await validationError(50)).not.toContain('assetIds')
  })

  it('11장에서 걸리지 않는다 — 옛 10장 상한이 되살아나지 않게', async () => {
    expect(await validationError(11)).not.toContain('assetIds')
  })
})
