import { beforeEach, describe, expect, it, vi } from 'vitest'

const logged = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: logged }))

const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/server/context', () => ({ getContext: async () => ctx.value }))

vi.mock('@/lib/db-init', () => ({ prismaPublic: {} }))

const familyCaps = vi.hoisted(() => ({ value: [] as string[] }))
vi.mock('@/server/permissions/family-capabilities', () => ({
  getFamilyCapabilities: async () => new Set(familyCaps.value),
}))

const initAsset = vi.hoisted(() => vi.fn())
vi.mock('@/server/upload/init', () => ({ initAssetViaMedia: initAsset }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'bebe.example.com', 'x-forwarded-proto': 'https' }),
}))

const { startUpload } = await import('./actions')

const input = { mime: 'image/jpeg', sizeBytes: 10, originalName: 'a.jpg' }
const member = (role: 'owner' | 'family') => ({
  user: { id: 'u1' },
  family: { id: 'f1' },
  membership: { role },
  capabilities: [],
})

describe('startUpload', () => {
  beforeEach(() => {
    logged.info.mockClear()
    logged.warn.mockClear()
    logged.error.mockClear()
    initAsset.mockReset()
    familyCaps.value = []
  })

  it('미로그인은 401 봉투 — 던지지 않는다', async () => {
    ctx.value = { user: null, family: null, membership: null, capabilities: [] }
    await expect(startUpload(input)).resolves.toEqual({
      ok: false,
      status: 401,
      errorKey: 'errors.unauthorized',
    })
    expect(logged.info).toHaveBeenCalledTimes(1)
  })

  it('업로드 권한이 없는 family 역할은 403 + warn 로그 (init 은 호출되지 않는다)', async () => {
    ctx.value = member('family')
    const r = await startUpload(input)
    expect(r).toEqual({ ok: false, status: 403, errorKey: 'errors.asset.uploadDenied' })
    expect(initAsset).not.toHaveBeenCalled()
    expect(logged.warn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'upload.start', status: 403 }),
      'action rejected',
    )
  })

  it('미디어가 아닌 MIME 은 400', async () => {
    ctx.value = member('owner')
    await expect(startUpload({ ...input, mime: 'application/pdf' })).resolves.toEqual({
      ok: false,
      status: 400,
      errorKey: 'errors.asset.mediaOnly',
    })
    expect(initAsset).not.toHaveBeenCalled()
  })

  it('허용되면 init 결과를 돌려주고 tus URL 을 현재 오리진으로 절대화한다', async () => {
    ctx.value = member('owner')
    initAsset.mockResolvedValue({
      assetId: 'a1',
      tusUploadUrl: '/media/v1/tus/a1',
      uploadToken: 'tok',
      expiresAt: '2026-01-01T00:00:00.000Z',
    })
    const r = await startUpload(input)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.tusUploadUrl).toBe('https://bebe.example.com/media/v1/tus/a1')
    expect(initAsset).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'f1', uploaderId: 'u1', mime: 'image/jpeg' }),
    )
    expect(logged.warn).not.toHaveBeenCalled()
  })
})
