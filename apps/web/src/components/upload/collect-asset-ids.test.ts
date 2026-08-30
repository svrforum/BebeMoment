import { describe, expect, it } from 'vitest'
import { collectAssetIds } from './collect-asset-ids'

describe('collectAssetIds', () => {
  it('returns all assetIds once every file has one', async () => {
    const files = [
      { id: 'a', meta: { assetId: 'A' } },
      { id: 'b', meta: { assetId: 'B' } },
    ]
    const out = await collectAssetIds(() => files, ['a', 'b'], { intervalMs: 5 })
    expect(out).toEqual(['A', 'B'])
  })

  it('resolves as soon as ids appear (no fixed wait)', async () => {
    const files: { id: string; meta?: { assetId?: string } }[] = [{ id: 'a' }]
    setTimeout(() => {
      files[0] = { id: 'a', meta: { assetId: 'A' } }
    }, 10)
    const out = await collectAssetIds(() => files, ['a'], { intervalMs: 5, timeoutMs: 2000 })
    expect(out).toEqual(['A'])
  })

  it('returns only the resolved ones when the deadline passes (partial)', async () => {
    const files = [{ id: 'a', meta: { assetId: 'A' } }, { id: 'b' }]
    const out = await collectAssetIds(() => files, ['a', 'b'], { intervalMs: 5, timeoutMs: 30 })
    expect(out).toEqual(['A'])
  })
})

describe('collectAssetIds — 진행 중이면 기다린다', () => {
  it('id 가 계속 붙는 동안에는 포기하지 않는다', async () => {
    // 사진 10장 이상을 고르면 전처리(리사이즈+init)가 폰에서 수십 초 걸린다. 고정 기한을
    // 두면 정상 동작 중에 스토리만 실패하고 사진은 개별로 올라가 버렸다.
    const files: { id: string; meta?: { assetId?: string } }[] = Array.from(
      { length: 6 },
      (_, i) => ({ id: String(i) }),
    )
    for (let i = 0; i < 6; i++) {
      setTimeout(
        () => {
          files[i] = { id: String(i), meta: { assetId: `A${i}` } }
        },
        20 * (i + 1),
      )
    }
    const out = await collectAssetIds(
      () => files,
      files.map((f) => f.id),
      { intervalMs: 5, stallMs: 50 },
    )
    expect(out).toHaveLength(6)
  })

  it('진행이 멈추면 stallMs 뒤에 부분 결과로 끝낸다', async () => {
    const files = [{ id: 'a', meta: { assetId: 'A' } }, { id: 'b' }]
    const started = Date.now()
    const out = await collectAssetIds(() => files, ['a', 'b'], { intervalMs: 5, stallMs: 40 })
    expect(out).toEqual(['A'])
    expect(Date.now() - started).toBeLessThan(400)
  })

  it('아무리 진행 중이어도 maxMs 는 넘기지 않는다 — 영원히 매달리지 않는다', async () => {
    const files: { id: string; meta?: { assetId?: string } }[] = [{ id: 'a' }, { id: 'b' }]
    const t = setInterval(() => {
      files[0] = { id: 'a', meta: { assetId: `A${Date.now()}` } }
    }, 10)
    const out = await collectAssetIds(() => files, ['a', 'b'], {
      intervalMs: 5,
      stallMs: 1000,
      maxMs: 60,
    })
    clearInterval(t)
    expect(out.length).toBeLessThan(2)
  })
})
