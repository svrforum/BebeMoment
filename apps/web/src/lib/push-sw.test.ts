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
const OTHER_ASSET = '22222222-2222-4222-8222-222222222222'

/** 짧은 이미지 주소 — 토큰은 15분마다 바뀌고 자산·이름은 그대로다. */
function imgUrl(name: string, token = '1800004500.sig-a', asset = ASSET): string {
  return `${ORIGIN}/media/v1/img/${asset}/${token}/${name}`
}

/** 키별 JWT 주소 — 원본·영상, 그리고 배포 전에 열려 있던 화면의 이미지. */
function fileUrl(key: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${ORIGIN}/media/v1/files/${b64({ alg: 'HS256' })}.${b64({ iss: 'media', key, iat: 1 })}.sig`
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
  vm.runInNewContext(code, { self, caches, fetch, URL })

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

  it('한 번 받은 파생물은 토큰이 바뀐 주소로 와도 네트워크 없이 준다', async () => {
    const first = await sw.request(imgUrl('thumb256.webp', '1800004500.sig-a'))
    expect(first?.body).toContain('sig-a')
    expect(sw.fetched).toHaveLength(1)

    // 15분 뒤 — 토큰만 다르고 같은 사진.
    const second = await sw.request(imgUrl('thumb256.webp', '1800005400.sig-b'))
    expect(second?.body).toContain('sig-a')
    expect(sw.fetched).toHaveLength(1)
  })

  it('크기·형식·자산이 다르면 다른 사진으로 본다', async () => {
    await sw.request(imgUrl('thumb256.webp'))
    await sw.request(imgUrl('thumb512.webp'))
    await sw.request(imgUrl('thumb256.avif'))
    await sw.request(imgUrl('poster.jpg'))
    await sw.request(imgUrl('thumb256.webp', undefined, OTHER_ASSET))
    expect(sw.fetched).toHaveLength(5)
  })

  it('JWT 주소 시절에 받아 둔 사진을 새 주소에서도 그대로 쓴다', async () => {
    // 보관 키는 주소 형식이 바뀌어도 `derivatives/<자산>/<이름>` 그대로다 — 배포하면서
    // 모든 기기가 썸네일을 다시 받는 일이 없어야 한다.
    sw.stores.set(
      'bebe-img-v1',
      new Map([
        [`${ORIGIN}/__img/derivatives/${ASSET}/thumb256.webp`, response('kept from before')],
      ]),
    )
    expect((await sw.request(imgUrl('thumb256.webp')))?.body).toBe('kept from before')
    expect(sw.fetched).toHaveLength(0)
  })

  it.each([
    ['원본', fileUrl(`families/${OTHER_ASSET}/assets/${ASSET}/original.jpg`), {}],
    ['영상 프리뷰', fileUrl(`derivatives/${ASSET}/preview.mp4`), {}],
    ['JWT 주소의 이미지', fileUrl(`derivatives/${ASSET}/thumb256.webp`), {}],
    ['Range 요청', imgUrl('thumb256.webp'), { range: true }],
    ['GET 이 아닌 요청', imgUrl('thumb256.webp'), { method: 'POST' }],
    ['다른 출처', imgUrl('thumb256.webp').replace(ORIGIN, 'https://other.example.com'), {}],
    ['목록에 없는 이름(영상)', imgUrl('preview.mp4'), {}],
    ['목록에 없는 이름(원본)', imgUrl('original.jpg'), {}],
    ['대문자 이름', imgUrl('THUMB256.WEBP'), {}],
    ['UUID 가 아닌 자산', imgUrl('thumb256.webp', undefined, 'asset'), {}],
    ['조각이 더 붙은 경로', `${imgUrl('thumb256.webp')}/x`, {}],
    ['토큰이 빠진 경로', `${ORIGIN}/media/v1/img/${ASSET}/thumb256.webp`, {}],
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
    expect((await sw.request(imgUrl('thumb256.webp')))?.status).toBe(status)
    await sw.request(imgUrl('thumb256.webp'))
    expect(sw.fetched).toHaveLength(2)
  })

  it('보관 개수를 넘기면 오래된 것부터 버린다', async () => {
    const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
    for (let n = 0; n < 2080; n += 1) await sw.request(imgUrl('thumb256.webp', undefined, id(n)))
    const store = sw.stores.get('bebe-img-v1')
    expect(store?.size).toBeLessThanOrEqual(2040)
    expect(store?.has(`${ORIGIN}/__img/derivatives/${id(0)}/thumb256.webp`)).toBe(false)
    expect(store?.has(`${ORIGIN}/__img/derivatives/${id(2079)}/thumb256.webp`)).toBe(true)
  })

  it('보관하는 이름 목록이 media 가 내주는 이름 목록과 같다', () => {
    // 한쪽에만 크기·형식을 더하면 그 사진은 조용히 캐시에서 빠진다(매번 다시 받는다).
    const names = /\(\?:\(\?:[a-z0-9|]+\)\\\.\(\?:[a-z|]+\)\|poster\\\.jpg\)/
    const worker = readFileSync(path.join(process.cwd(), 'public/push-sw.js'), 'utf8')
    const media = readFileSync(path.join(process.cwd(), '../media/src/domain/asset-key.ts'), 'utf8')
    const inMedia = names.exec(media)?.[0]
    expect(inMedia).toBeDefined()
    expect(worker).toContain((inMedia as string).slice('(?:'.length, -1))
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
