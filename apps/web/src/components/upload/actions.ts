'use server'
import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { initAssetViaMedia } from '@/server/upload/init'
import { resolveCan } from '@bebe/core'
import type { InitAssetResponse } from '@bebe/media-client'

export type StartUploadInput = {
  mime: string
  sizeBytes: number
  originalName: string
  clientBlurhash?: string
  clientAspectRatio?: number
  clientWidth?: number
  clientHeight?: number
}

export async function startUpload(input: StartUploadInput): Promise<InitAssetResponse> {
  const { session } = await getAuth()
  if (!session) throw new Error('Unauthorized')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) throw new Error('No current family')
  if (!ctx.membership) throw new Error('No current family')
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.upload', familyCaps)) {
    throw new Error('업로드 권한이 없어요. 관리자에게 문의하세요.')
  }

  return await initAssetViaMedia({
    familyId: ctx.family.id,
    uploaderId: ctx.user.id,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    originalName: input.originalName,
    ...(input.clientBlurhash !== undefined && { clientBlurhash: input.clientBlurhash }),
    ...(input.clientAspectRatio !== undefined && { clientAspectRatio: input.clientAspectRatio }),
    ...(input.clientWidth !== undefined && { clientWidth: input.clientWidth }),
    ...(input.clientHeight !== undefined && { clientHeight: input.clientHeight }),
  })
}
