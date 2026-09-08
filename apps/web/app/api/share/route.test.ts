import { createAsset } from '@/server/asset/create'
import { updateAssetStatus } from '@/server/asset/update-status'
import { signup } from '@/server/auth/signup'
import { createFamily } from '@/server/family/create'
import { setSetting } from '@/server/settings/set'
import { createShareLink } from '@/server/share/create'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type AuthState = { userId: string; familyId: string } | null
const state = vi.hoisted(() => ({ db: null as unknown as FullTestDb, auth: null as AuthState }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { has: () => true }),
  getLocale: async () => 'ko',
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () =>
    state.auth
      ? {
          user: {
            id: state.auth.userId,
            email: null,
            emailVerified: false,
            displayName: 'U',
            locale: 'ko',
          },
          session: { id: 'sess', userId: state.auth.userId, currentFamilyId: state.auth.familyId },
        }
      : { user: null, session: null },
}))
vi.mock('@/lib/db-init', () => ({
  get prismaPublic() {
    return state.db.prismaPublic
  },
  get prismaMedia() {
    return state.db.prismaMedia
  },
}))

beforeAll(async () => {
  state.db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await state.db.stop()
})
beforeEach(async () => {
  const p = state.db.prismaPublic
  await p.appSetting.deleteMany()
  await p.shareLink.deleteMany()
  await state.db.prismaMedia.asset.deleteMany()
  await p.membership.deleteMany()
  await p.family.deleteMany()
  await p.user.deleteMany()
  state.auth = null
})

const DAY = '2026-04-01'

async function setup() {
  const { user: owner } = await signup(
    { username: 'owner', password: 'password123', displayName: 'O' },
    state.db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: owner.id }, state.db.prismaPublic)
  const { user: member } = await signup(
    { username: 'member', password: 'password123', displayName: 'M' },
    state.db.prismaPublic,
  )
  await state.db.prismaPublic.membership.create({
    data: { familyId: family.id, userId: member.id, role: 'family' },
  })
  const asset = await createAsset(
    {
      familyId: family.id,
      uploadedByUserId: owner.id,
      kind: 'image',
      originalKey: 'k-share',
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: 'a'.repeat(64),
      takenAt: new Date(`${DAY}T10:00:00Z`),
      takenAtSource: 'uploaded',
    },
    state.db.prismaPublic,
    state.db.prismaMedia,
  )
  await updateAssetStatus(
    { assetId: asset.id, familyId: family.id, status: 'ready' },
    state.db.prismaMedia,
  )
  return { owner, member, family, asset }
}

function get(query: string): Promise<Response> {
  return import('./route').then(({ GET }) => GET(new Request(`http://localhost/api/share${query}`)))
}

describe('GET /api/share', () => {
  it('401 without a session', async () => {
    await setup()
    const res = await get(`?date=${DAY}`)
    expect(res.status).toBe(401)
  })

  // 공유 토큰은 인증 경계 밖 접근 자격 — 발행 권한 없는 역할이 ?date 로 기존 토큰을 열거해
  // 외부로 흘리지 못하게 POST 와 같은 게이트를 건다.
  it('403 for a family member without share.create when listing a target', async () => {
    const { member, family } = await setup()
    state.auth = { userId: member.id, familyId: family.id }
    const res = await get(`?date=${DAY}`)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('?mine=1 lists only my own links and needs no share.create', async () => {
    const { owner, member, family, asset } = await setup()
    await createShareLink(
      {
        target: { kind: 'asset', assetId: asset.id },
        familyId: family.id,
        userId: owner.id,
        ttl: '7d',
      },
      state.db.prismaPublic,
      state.db.prismaMedia,
    )
    state.auth = { userId: member.id, familyId: family.id }
    const res = await get('?mine=1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ links: [] })
  })

  it('lists links for a target when the caller may share, 400 without a target', async () => {
    const { owner, family } = await setup()
    await createShareLink(
      {
        target: { kind: 'date', date: DAY },
        familyId: family.id,
        userId: owner.id,
        ttl: 'permanent',
      },
      state.db.prismaPublic,
      state.db.prismaMedia,
    )
    state.auth = { userId: owner.id, familyId: family.id }
    const res = await get(`?date=${DAY}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { links: unknown[] }
    expect(body.links).toHaveLength(1)

    const noTarget = await get('')
    expect(noTarget.status).toBe(400)
    expect(await noTarget.json()).toEqual({ error: 'share.targetRequired' })
  })

  it('403 when the share feature is switched off', async () => {
    const { owner, family } = await setup()
    await setSetting('features.share', false, null, state.db.prismaPublic)
    state.auth = { userId: owner.id, familyId: family.id }
    const res = await get(`?date=${DAY}`)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'share.featureOff' })
  })
})
