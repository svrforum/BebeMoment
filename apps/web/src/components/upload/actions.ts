'use server'
import { requireActionContext } from '@/lib/action-context'
import type { ActionResult } from '@/lib/action-result'
import { prismaPublic } from '@/lib/db-init'
import { actionReject, withActionLog } from '@/lib/with-action-log'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { initAssetViaMedia } from '@/server/upload/init'
import { resolveCan } from '@bebe/core'
import type { InitAssetResponse } from '@bebe/media-client'
import { headers } from 'next/headers'

// media 는 tus 업로드 URL 을 상대경로(/media/v1/tus/...)로 준다. tus-js-client 는 절대
// URL 을 요구하므로(상대 uploadUrl 이면 업로드 에러) 현재 접속 오리진(프록시 뒤
// x-forwarded-*)으로 절대화한다 — same-origin 이라 mixed-content 도 없다.
async function absolutizeTusUrl(url: string): Promise<string> {
  if (!url.startsWith('/')) return url
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '')
  // 프록시가 호스트 헤더를 안 줄 때만 PUBLIC_URL 로 폴백.
  if (!host) return publicUrl ? `${publicUrl}${url}` : url
  // 스킴은 x-forwarded-proto 우선, 없으면 PUBLIC_URL 스킴(https 도메인에서 http 로 추측해
  // mixed-content 로 막히는 걸 방지). 둘 다 없으면 http.
  const proto = h.get('x-forwarded-proto') ?? (publicUrl?.startsWith('https') ? 'https' : 'http')
  return `${proto}://${host}${url}`
}

export type StartUploadInput = {
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

export async function startUpload(
  input: StartUploadInput,
): Promise<ActionResult<InitAssetResponse>> {
  return withActionLog('upload.start', async () => {
    const ctx = await requireActionContext()
    const familyCaps = await getFamilyCapabilities(prismaPublic)
    if (!resolveCan(ctx.membership.role, 'asset.upload', familyCaps)) {
      throw actionReject(403, 'errors.asset.uploadDenied')
    }
    // 미디어(이미지/영상)만 — 클라가 보낸 mime 으로 워커 파이프라인이 분기하므로 경계에서 제한.
    if (!/^(image|video)\//.test(input.mime)) {
      throw actionReject(400, 'errors.asset.mediaOnly')
    }

    const result = await initAssetViaMedia({
      familyId: ctx.family.id,
      uploaderId: ctx.user.id,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      originalName: input.originalName,
      ...(input.fileModifiedAt !== undefined && { fileModifiedAt: input.fileModifiedAt }),
      ...(input.clientBlurhash !== undefined && { clientBlurhash: input.clientBlurhash }),
      ...(input.clientAspectRatio !== undefined && { clientAspectRatio: input.clientAspectRatio }),
      ...(input.clientWidth !== undefined && { clientWidth: input.clientWidth }),
      ...(input.clientHeight !== undefined && { clientHeight: input.clientHeight }),
      ...(input.notify !== undefined && { notify: input.notify }),
    })
    return { ...result, tusUploadUrl: await absolutizeTusUrl(result.tusUploadUrl) }
  })
}
