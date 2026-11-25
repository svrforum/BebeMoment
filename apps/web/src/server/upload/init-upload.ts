import { ServiceError } from '@/server/error'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { getSetting } from '@/server/settings/get'
import { type Role, resolveCan } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { type InitAssetResponse, type MediaClient, isUploadableMime } from '@bebe/media-client'
import { z } from 'zod'

export type UploadInitInput = {
  mime: string
  sizeBytes: number
  originalName: string
  fileModifiedAt?: string
  clientBlurhash?: string
  clientAspectRatio?: number
  clientWidth?: number
  clientHeight?: number
  notify?: boolean
}

type HeaderReader = Pick<Headers, 'get'>

// media 는 tus 업로드 URL 을 상대경로(/media/v1/tus/...)로 준다. tus-js-client 는 절대
// URL 을 요구하므로 현재 접속 오리진(프록시 뒤 x-forwarded-*)으로 절대화한다 — same-origin
// 이라 mixed-content 도 없다. 요청 오리진의 다른 계산(publicOrigin)과 달리 스킴 기본값이
// http 다: 프록시 없이 LAN http 로 바로 들어온 업로드가 https 로 추측돼 끊기지 않게.
function absolutizeTusUrl(url: string, headers: HeaderReader): string {
  if (!url.startsWith('/')) return url
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '')
  if (!host) return publicUrl ? `${publicUrl}${url}` : url
  const proto =
    headers.get('x-forwarded-proto') ?? (publicUrl?.startsWith('https') ? 'https' : 'http')
  return `${proto}://${host}${url}`
}

/**
 * 업로드 시작(자산 생성 + tus 토큰)의 유일한 경로. 브라우저의 `startUpload` 서버 액션과
 * 예전 안드로이드 앱의 `POST /api/share/init` 이 둘 다 이것만 부른다 — 사본이었을 때 mime
 * 검사가 한쪽에만 들어가 갈라졌었다.
 */
export async function initUpload(
  actor: { role: Role; familyId: string; userId: string },
  input: UploadInitInput,
  deps: { prisma: PrismaClient; media: MediaClient; headers: HeaderReader },
): Promise<InitAssetResponse> {
  const familyCaps = await getFamilyCapabilities(deps.prisma)
  if (!resolveCan(actor.role, 'asset.upload', familyCaps)) {
    throw new ServiceError(403, 'asset.uploadDenied')
  }
  // 클라가 보낸 mime 으로 자산 종류와 워커 파이프라인이 갈린다. media 도 같은 규칙으로 막는다.
  if (!isUploadableMime(input.mime)) {
    throw new ServiceError(400, 'asset.mediaOnly')
  }
  const convertToCompatible = await getSetting(
    'upload.convert_to_compatible',
    z.boolean(),
    false,
    deps.prisma,
  )
  // 서버 액션 인자는 검증 없이 클라에서 오므로 펼치지 않고 필드를 골라 담는다 — 가족·업로더는
  // 세션에서만.
  const result = await deps.media.initAsset({
    familyId: actor.familyId,
    uploaderId: actor.userId,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    originalName: input.originalName,
    convertToCompatible,
    ...(input.fileModifiedAt !== undefined && { fileModifiedAt: input.fileModifiedAt }),
    ...(input.clientBlurhash !== undefined && { clientBlurhash: input.clientBlurhash }),
    ...(input.clientAspectRatio !== undefined && { clientAspectRatio: input.clientAspectRatio }),
    ...(input.clientWidth !== undefined && { clientWidth: input.clientWidth }),
    ...(input.clientHeight !== undefined && { clientHeight: input.clientHeight }),
    ...(input.notify !== undefined && { notify: input.notify }),
  })
  return { ...result, tusUploadUrl: absolutizeTusUrl(result.tusUploadUrl, deps.headers) }
}
