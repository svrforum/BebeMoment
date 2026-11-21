import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { PHOTO_CACHE_PREFIX } from './photo-cache'

/**
 * public/push-sw.js 는 빌드를 거치지 않는 맨 JS 라 타입체크도 번들도 지나지 않는다. 사진 캐시가
 * 잘못되면 모든 화면의 이미지가 깨지므로, 파일을 그대로 읽어 가짜 워커 환경에서 돌려 본다.
 */

const ORIGIN = 'https://bebe.example.com'
const ASSET = '11111111-1111-4111-8111-111111111111'

function fileUrl(key: string, signature = 'sig-a'): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${ORIGIN}/media/v1/files/${b64({ alg: 'HS256' })}.${b64({ iss: 'media', key, iat: 1 })}.${signature}`
}

type FakeResponse = { status: number; type: string; body: string; clone: () => FakeResponse }
const response = (body: string, status = 200, type = 'basic'): FakeResponse => ({
  status,
  type,
  body,
  clone: () => response(body, status, type),
})

function loadWorker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const stores = new Map<string, Map<string, FakeResponse>>()
  const fetched: string[] = []
  let nextResponse: (url: string) => FakeResponse = (url) => response(`bytes of ${url}`)
  const caches = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, FakeResponse>()
      stores.set(name, store)
      return {
        match: async (k: string) => store.get(k),
        put: async (k: string, r: FakeResponse) => void store.set(k, r),
        keys: async () => [...store.keys()],
        delete: async (k: string) => store.delete(k),
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => handlers.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  }
  const fetch = async (req: { url: string }) => {
    fetched.push(req.url)
    return nextResponse(req.url)
  }
  const code = readFileSync(path.join(process.cwd(), 'public/push-sw.js'), 'utf8')
  vm.runInNewContext(code, { self, caches, fetch, URL, atob, JSON, Promise })

  /** fetch 이벤트를 보내고, 워커가 응답을 가로챘으면 그 응답을(아니면 null) 돌려준다. */
  async function request(url: string, init: { method?: string; range?: boolean } = {}) {
    let answer: Promise<FakeResponse> | null = null
    const pending: Promise<unknown>[] = []
    handlers.get('fetch')?.({
      request: {
        url,
        method: init.method ?? 'GET',
        headers: new Headers(init.range ? { range: 'bytes=0-' } : {}),
      },
      respondWith: (p: Promise<FakeResponse>) => {
        answer = p
      },
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    })
    const res = answer ? await (answer as Promise<FakeResponse>) : null
    await Promise.all(pending)
    return res
  }
  return {
    request,
    fetched,
    stores,
    handlers,
    setResponse: (fn: (url: string) => FakeResponse) => {
      nextResponse = fn
    },
  }
}

describe('push-sw 사진 캐시', () => {
  let sw: ReturnType<typeof loadWorker>
  beforeEach(() => {
    sw = loadWorker()
  })

  it('한 번 받은 파생물은 서명이 바뀐 주소로 와도 네트워크 없이 준다', async () => {
    const key = `derivatives/${ASSET}/thumb256.webp`
    const first = await sw.request(fileUrl(key, 'sig-a'))
    expect(first?.body).toContain('sig-a')
    expect(sw.fetched).toHaveLength(1)

    // 15분 뒤 — 토큰(서명)만 다르고 같은 사진.
    const second = await sw.request(fileUrl(key, 'sig-b'))
    expect(second?.body).toContain('sig-a')
    expect(sw.fetched).toHaveLength(1)
  })

  it('크기·형식이 다르면 다른 사진으로 본다', async () => {
    await sw.request(fileUrl(`derivatives/${ASSET}/thumb256.webp`))
    await sw.request(fileUrl(`derivatives/${ASSET}/thumb512.webp`))
    await sw.request(fileUrl(`derivatives/${ASSET}/thumb256.avif`))
    expect(sw.fetched).toHaveLength(3)
  })

  it.each([
    [
      '원본',
      fileUrl(`families/22222222-2222-4222-8222-222222222222/assets/${ASSET}/original.jpg`),
      {},
    ],
    ['영상 프리뷰', fileUrl(`derivatives/${ASSET}/preview.mp4`), {}],
    ['Range 요청', fileUrl(`derivatives/${ASSET}/thumb256.webp`), { range: true }],
    ['GET 이 아닌 요청', fileUrl(`derivatives/${ASSET}/thumb256.webp`), { method: 'POST' }],
    [
      '다른 출처',
      fileUrl(`derivatives/${ASSET}/thumb256.webp`).replace(ORIGIN, 'https://other.example.com'),
      {},
    ],
    ['깨진 토큰', `${ORIGIN}/media/v1/files/not-a-token`, {}],
    ['페이지', `${ORIGIN}/timeline`, {}],
    ['API', `${ORIGIN}/api/timeline?limit=30`, {}],
  ] as const)('%s 은 건드리지 않는다', async (_name, url, init) => {
    expect(await sw.request(url, init)).toBeNull()
    expect(sw.fetched).toHaveLength(0)
  })

  it.each([
    ['만료(401)', 401, 'basic'],
    ['부분 응답(206)', 206, 'basic'],
    ['외부로 리다이렉트된 응답(S3)', 0, 'opaque'],
  ] as const)('%s 은 돌려주기만 하고 보관하지 않는다', async (_name, status, type) => {
    sw.setResponse(() => response('x', status, type))
    const key = `derivatives/${ASSET}/thumb256.webp`
    expect((await sw.request(fileUrl(key)))?.status).toBe(status)
    await sw.request(fileUrl(key))
    expect(sw.fetched).toHaveLength(2)
  })

  it('보관 개수를 넘기면 오래된 것부터 버린다', async () => {
    const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
    for (let n = 0; n < 2080; n += 1)
      await sw.request(fileUrl(`derivatives/${id(n)}/thumb256.webp`))
    const store = sw.stores.get('bebe-img-v1')
    expect(store?.size).toBeLessThanOrEqual(2040)
    expect(store?.has(`${ORIGIN}/__img/derivatives/${id(0)}/thumb256.webp`)).toBe(false)
    expect(store?.has(`${ORIGIN}/__img/derivatives/${id(2079)}/thumb256.webp`)).toBe(true)
  })

  it('로그인 화면이 지우는 접두사와 워커의 캐시 이름이 맞는다', () => {
    expect(PHOTO_CACHE_PREFIX).toBe('bebe-img-')
    expect([...sw.stores.keys()]).toEqual([])
    const code = readFileSync(path.join(process.cwd(), 'public/push-sw.js'), 'utf8')
    expect(code).toMatch(new RegExp(`const IMG_CACHE = '${PHOTO_CACHE_PREFIX}v\\d+'`))
  })

  it('새 버전이 켜지면 이름이 다른 옛 사진 캐시를 지운다', async () => {
    sw.stores.set('bebe-img-v0', new Map())
    sw.stores.set('other-cache', new Map())
    const pending: Promise<unknown>[] = []
    sw.handlers.get('activate')?.({ waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)
    expect([...sw.stores.keys()]).toEqual(['other-cache'])
  })
})
