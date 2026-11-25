import { ServiceError } from '@/server/error'
import { setSetting } from '@/server/settings/set'
import { type TestDb, startTestDb } from '@bebe/db-public/src/test-db'
import { FakeMediaClient, type InitAssetRequest, type InitAssetResponse } from '@bebe/media-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initUpload } from './init-upload'

// media 는 tus 주소를 루트 상대 경로로 준다 — 절대화가 실제로 일어나는지 보려면 그 모양이어야 한다.
class RelativeTusMedia extends FakeMediaClient {
  override async initAsset(input: InitAssetRequest): Promise<InitAssetResponse> {
    const r = await super.initAsset(input)
    return { ...r, tusUploadUrl: `/media/v1/tus/${r.assetId}` }
  }
}

const FAMILY = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const input = { mime: 'image/jpeg', sizeBytes: 10, originalName: 'a.jpg' }
const owner = { role: 'owner' as const, familyId: FAMILY, userId: USER }
const family = { role: 'family' as const, familyId: FAMILY, userId: USER }

let db: TestDb
let media: RelativeTusMedia
const proxied = new Headers({ host: 'app.example.com', 'x-forwarded-proto': 'https' })

beforeAll(async () => {
  db = await startTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.appSetting.deleteMany()
  media = new RelativeTusMedia()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

async function rejection(p: Promise<unknown>): Promise<ServiceError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e).toBeInstanceOf(ServiceError)
  return e as ServiceError
}

describe('initUpload — 업로드 진입점 공통 경계', () => {
  it('업로드 권한이 없는 family 역할은 403 — media 는 부르지 않는다', async () => {
    const e = await rejection(
      initUpload(family, input, { prisma: db.prisma, media, headers: proxied }),
    )
    expect(e.status).toBe(403)
    expect(e.message).toBe('asset.uploadDenied')
    expect(media.calls.initAsset).toHaveLength(0)
  })

  it('관리자가 업로드를 허용한 family 역할은 올릴 수 있다', async () => {
    await setSetting('permissions.family', ['asset.upload'], null, db.prisma)
    await initUpload(family, input, { prisma: db.prisma, media, headers: proxied })
    expect(media.calls.initAsset).toHaveLength(1)
  })

  it.each(['application/pdf', 'text/html', ''])('사진·영상이 아닌 %j 은 400', async (mime) => {
    const e = await rejection(
      initUpload(owner, { ...input, mime }, { prisma: db.prisma, media, headers: proxied }),
    )
    expect(e.status).toBe(400)
    expect(e.message).toBe('asset.mediaOnly')
    expect(media.calls.initAsset).toHaveLength(0)
  })

  it('가족·업로더는 세션에서만 온다 — 입력에 실려 와도 무시한다', async () => {
    const forged = { ...input, familyId: '99999999-9999-4999-8999-999999999999', uploaderId: 'x' }
    await initUpload(owner, forged, { prisma: db.prisma, media, headers: proxied })
    expect(media.calls.initAsset[0]).toMatchObject({ familyId: FAMILY, uploaderId: USER })
  })

  it('호환 변환 설정과 선택 필드를 media 로 넘긴다', async () => {
    await setSetting('upload.convert_to_compatible', true, null, db.prisma)
    await initUpload(
      owner,
      { ...input, fileModifiedAt: '2026-03-04T01:02:03.000Z', clientWidth: 4, notify: false },
      { prisma: db.prisma, media, headers: proxied },
    )
    expect(media.calls.initAsset[0]).toEqual({
      familyId: FAMILY,
      uploaderId: USER,
      mime: 'image/jpeg',
      sizeBytes: 10,
      originalName: 'a.jpg',
      convertToCompatible: true,
      fileModifiedAt: '2026-03-04T01:02:03.000Z',
      clientWidth: 4,
      notify: false,
    })
  })

  describe('tus 주소 절대화 — tus-js-client 는 절대 주소만 받는다', () => {
    async function tusUrl(headers: Headers): Promise<string> {
      const r = await initUpload(owner, input, { prisma: db.prisma, media, headers })
      return r.tusUploadUrl.replace(/[0-9a-f-]{36}$/, '<id>')
    }

    it('프록시가 준 호스트·스킴을 쓴다', async () => {
      const headers = new Headers({
        host: 'internal:3000',
        'x-forwarded-host': 'app.example.com',
        'x-forwarded-proto': 'https',
      })
      expect(await tusUrl(headers)).toBe('https://app.example.com/media/v1/tus/<id>')
    })

    it('프록시가 여럿이면 맨 앞(클라이언트 쪽) 값만 쓴다', async () => {
      const headers = new Headers({
        host: 'internal:3000',
        'x-forwarded-host': 'app.example.com, edge.example.com',
        'x-forwarded-proto': 'https, http',
      })
      expect(await tusUrl(headers)).toBe('https://app.example.com/media/v1/tus/<id>')
    })

    it('스킴 헤더가 없으면 PUBLIC_URL 의 스킴을 따른다 — https 도메인에서 http 로 추측하지 않게', async () => {
      vi.stubEnv('PUBLIC_URL', 'https://app.example.com/')
      expect(await tusUrl(new Headers({ host: 'app.example.com' }))).toBe(
        'https://app.example.com/media/v1/tus/<id>',
      )
    })

    it('둘 다 없으면 http — LAN 주소로 바로 들어온 경우', async () => {
      vi.stubEnv('PUBLIC_URL', 'http://nas.example.com:3000')
      expect(await tusUrl(new Headers({ host: 'nas.example.com:3000' }))).toBe(
        'http://nas.example.com:3000/media/v1/tus/<id>',
      )
    })

    it('호스트 헤더가 없으면 PUBLIC_URL 로 붙인다', async () => {
      vi.stubEnv('PUBLIC_URL', 'https://app.example.com/')
      expect(await tusUrl(new Headers())).toBe('https://app.example.com/media/v1/tus/<id>')
    })

    it('media 가 이미 절대 주소를 주면 그대로 둔다', async () => {
      const r = await initUpload(owner, input, {
        prisma: db.prisma,
        media: new FakeMediaClient(),
        headers: proxied,
      })
      expect(r.tusUploadUrl).toMatch(/^http:\/\/media\.fake\/media\/v1\/tus\//)
    })
  })
})
