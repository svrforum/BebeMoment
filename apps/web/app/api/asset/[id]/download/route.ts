import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { getSetting } from '@/server/settings/get'
import { isAssetHiddenFromViewer } from '@/server/story/secret-assets'
import { z } from 'zod'

const QUERY = z.object({ q: z.enum(['original', 'hd', 'sd']).default('original') })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)

  const url = new URL(req.url)
  const { q } = QUERY.parse(Object.fromEntries(url.searchParams))
  const { id } = await params

  // family 역할은 비밀 스토리 사진을 다운로드(공유 저장 포함)할 수 없다 — 다른 노출
  // 지점과 동일한 경계(defense-in-depth: id 를 직접 쳐도 차단).
  if (
    (ctx.membership?.role ?? 'family') === 'family' &&
    (await isAssetHiddenFromViewer('family', id, prismaPublic, ctx.family.id))
  ) {
    return errorJsonKey('notFound', 404)
  }

  // 압축 옵션이 꺼져 있으면 hd/sd 요청을 원본으로 폴백한다 — UI 가 숨겨져 있어도
  // URL 을 직접 친 경우에 대비한 서버측 최종 방어.
  let quality = q
  if (q !== 'original') {
    const enabled = await getSetting('download.compress.enabled', z.boolean(), true, prismaPublic)
    if (!enabled) quality = 'original'
  }

  try {
    // ⚠️ 302 리다이렉트로 PUBLIC_URL 절대주소를 넘기면 사용자가 다른 호스트
    // (HTTPS 도메인·다른 LAN IP 등) 로 접속 중일 때 cross-origin 이 되어 브라우저가
    // `<a download>` 의도와 쿠키를 떨궈 다운로드가 깨진다. 대신 same-origin 인 이
    // 엔드포인트에서 미디어 응답을 그대로 프록시해 흐름 전체를 같은 출처로 유지한다.
    const mediaUrl = await getMediaClient().mintDownloadUrl({
      familyId: ctx.family.id,
      assetId: id,
      quality,
    })
    // 미디어 URL 이 절대주소이면 컨테이너 내부에서도 외부 호스트네임으로 도는 셈이라
    // 비효율적 — `/media/...` 부분만 잘라 컨테이너 내부 미디어 서비스로 직접 호출.
    const path = new URL(mediaUrl).pathname + new URL(mediaUrl).search
    const internalBase = process.env.MEDIA_INTERNAL_URL || 'http://localhost:3001'
    const upstream = await fetch(`${internalBase}${path}`)
    if (!upstream.ok || !upstream.body) {
      return errorJsonKey('asset.mediaFetchFailed', upstream.status || 502)
    }
    // 응답 본문을 그대로 스트리밍 — Node fetch 의 ReadableStream 을 Next Response 에
    // 넘기면 chunked encoding 으로 흐른다. ffmpeg fragmented MP4 처럼 길이 미상도 OK.
    const headers = new Headers()
    const passthrough = ['content-type', 'content-disposition', 'cache-control', 'content-length']
    for (const h of passthrough) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    if (!headers.has('content-disposition')) {
      headers.set('content-disposition', 'attachment')
    }
    return new Response(upstream.body, { status: 200, headers })
  } catch (e) {
    return errorJson(e)
  }
}
