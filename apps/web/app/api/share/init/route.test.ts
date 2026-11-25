import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => false }),
}))
vi.mock('@/lib/db-init', () => ({ prismaPublic: {} }))

const state = vi.hoisted(() => ({
  signedIn: true,
  role: 'owner' as 'owner' | 'family',
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () =>
    state.signedIn
      ? { user: { id: 'u1' }, session: { userId: 'u1', currentFamilyId: 'f1' } }
      : { user: null, session: null },
}))
vi.mock('@/server/context', () => ({
  resolveContext: async () => ({
    user: { id: 'u1' },
    family: { id: 'f1' },
    membership: { role: state.role },
    capabilities: [],
  }),
}))
vi.mock('@/server/permissions/family-capabilities', () => ({
  getFamilyCapabilities: async () => new Set(),
}))
vi.mock('@/server/settings/get', () => ({
  getSetting: async (_key: string, _schema: unknown, fallback: unknown) => fallback,
}))

const initAsset = vi.hoisted(() => vi.fn())
vi.mock('@/lib/media-client', () => ({ getMediaClient: () => ({ initAsset }) }))

const { POST } = await import('./route')

function post(body: unknown): Request {
  return new Request('http://internal/api/share/init', {
    method: 'POST',
    headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' },
    body: JSON.stringify(body),
  })
}

const body = { mime: 'image/jpeg', sizeBytes: 10, originalName: 'a.jpg' }

describe('POST /api/share/init', () => {
  beforeEach(() => {
    state.signedIn = true
    state.role = 'owner'
    initAsset.mockReset()
    initAsset.mockResolvedValue({
      v: 1,
      assetId: 'a1',
      tusUploadUrl: '/media/v1/tus/a1',
      uploadToken: 'tok',
      expiresAt: '2026-03-04T00:00:00.000Z',
    })
  })

  it('미로그인은 401', async () => {
    state.signedIn = false
    expect((await POST(post(body))).status).toBe(401)
    expect(initAsset).not.toHaveBeenCalled()
  })

  // startUpload 에만 있던 검사 — 이 경로는 아무 파일이나 자산으로 만들었었다.
  it('사진·영상이 아닌 파일은 400 — media 를 부르지 않는다', async () => {
    const res = await POST(post({ ...body, mime: 'application/pdf' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'asset.mediaOnly' })
    expect(initAsset).not.toHaveBeenCalled()
  })

  it('업로드 권한이 없는 family 역할은 403', async () => {
    state.role = 'family'
    const res = await POST(post(body))
    expect(res.status).toBe(403)
    expect(initAsset).not.toHaveBeenCalled()
  })

  it('허용되면 tus 주소를 요청 오리진으로 절대화해 돌려준다', async () => {
    const res = await POST(post(body))
    expect(res.status).toBe(200)
    expect((await res.json()).tusUploadUrl).toBe('https://app.example.com/media/v1/tus/a1')
    expect(initAsset).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'f1', uploaderId: 'u1', mime: 'image/jpeg' }),
    )
  })
})
