import { randomUUID } from 'node:crypto'
import { createAlbum } from '@/server/album/create'
import { signup } from '@/server/auth/signup'
import { createFamily } from '@/server/family/create'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { createTranslator } from 'next-intl'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../../../messages/en.json'
import ko from '../../../messages/ko.json'

// 거절 문구에 개수·깊이가 들어가는 앨범 에러 세 가지가 서비스의 값과 함께 요청 로케일로 번역돼
// 나가는지 라우트 끝에서 본다. 번역기는 실제 카탈로그로 만든 next-intl 의 것이다.
const CATALOGS = { ko, en } as const
type Locale = keyof typeof CATALOGS
type Translate = ((key: string, values?: Record<string, string | number>) => string) & {
  has: (key: string) => boolean
}

function translator(locale: Locale, namespace: string): Translate {
  return createTranslator({
    locale,
    messages: CATALOGS[locale],
    namespace: namespace as 'errors',
    timeZone: 'UTC',
  }) as unknown as Translate
}

const state = vi.hoisted(() => ({
  db: null as unknown as FullTestDb,
  locale: 'ko' as 'ko' | 'en',
  session: null as { userId: string; currentFamilyId: string } | null,
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => translator(state.locale, namespace),
}))
vi.mock('@/lib/auth', () => ({
  getAuth: async () => ({ user: null, session: state.session }),
}))
vi.mock('@/lib/db-init', () => ({
  get prismaPublic() {
    return state.db.prismaPublic
  },
  get prismaMedia() {
    return state.db.prismaMedia
  },
}))

const { POST } = await import('./route')
const { DELETE, PATCH } = await import('./[id]/route')

beforeAll(async () => {
  state.db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await state.db.stop()
})
beforeEach(async () => {
  const p = state.db.prismaPublic
  await p.albumAsset.deleteMany()
  await p.album.deleteMany()
  await p.membership.deleteMany()
  await p.family.deleteMany()
  await p.user.deleteMany()
})

let counter = 0

/** 깊이 0~4 의 사슬(끝이 최대 깊이)과, 하위 앨범 하나·사진 하나가 든 루트 앨범. */
async function setup() {
  counter += 1
  const p = state.db.prismaPublic
  const { user } = await signup(
    { email: `albums-route-${counter}@b.com`, password: 'password123', displayName: 'O' },
    p,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, p)
  state.session = { userId: user.id, currentFamilyId: family.id }

  const by = { familyId: family.id, byUserId: user.id }
  const chain: string[] = []
  for (let depth = 0; depth <= 4; depth += 1) {
    const parent = chain.at(-1)
    const album = await createAlbum(
      { ...by, name: `Level ${depth}`, ...(parent ? { parentId: parent } : {}) },
      p,
    )
    chain.push(album.id)
  }

  const full = await createAlbum({ ...by, name: 'Full' }, p)
  await createAlbum({ ...by, name: 'Sub', parentId: full.id }, p)
  await p.albumAsset.create({
    data: {
      albumId: full.id,
      familyId: family.id,
      assetId: randomUUID(),
      addedByUserId: user.id,
    },
  })
  return { chain, fullId: full.id }
}

function jsonRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function errorOf(res: Response): Promise<{ status: number; error: string }> {
  return { status: res.status, error: ((await res.json()) as { error: string }).error }
}

describe.each(['ko', 'en'] as const)('앨범 거절 문구 — %s', (locale: Locale) => {
  const t = translator(locale, 'errors.album')

  it('최대 깊이 아래에 새 앨범', async () => {
    const s = await setup()
    state.locale = locale
    const res = await POST(
      jsonRequest('POST', 'http://app.example.com/api/albums', {
        name: 'Too deep',
        parentId: s.chain.at(-1),
      }),
    )
    expect(await errorOf(res)).toEqual({ status: 409, error: t('maxDepth', { levels: 5 }) })
  })

  it('옮기면 최대 깊이를 넘는 앨범', async () => {
    const s = await setup()
    state.locale = locale
    const res = await PATCH(
      jsonRequest('PATCH', `http://app.example.com/api/albums/${s.fullId}`, {
        parentId: s.chain.at(-2),
      }),
      params(s.fullId),
    )
    expect(await errorOf(res)).toEqual({ status: 409, error: t('moveMaxDepth', { levels: 5 }) })
  })

  it('하위 앨범·사진이 든 앨범을 cascade 없이 지우기', async () => {
    const s = await setup()
    state.locale = locale
    const res = await DELETE(
      jsonRequest('DELETE', `http://app.example.com/api/albums/${s.fullId}`),
      params(s.fullId),
    )
    expect(await errorOf(res)).toEqual({
      status: 409,
      error: t('hasContents', { albums: 1, photos: 1 }),
    })
  })

  it('번역된 문장에 값이 들어가 있다', () => {
    const text = t('hasContents', { albums: 2, photos: 3 })
    expect(text).toContain('2')
    expect(text).toContain('3')
    expect(text).not.toContain('{')
    expect(t('maxDepth', { levels: 5 })).toContain('5')
  })
})
