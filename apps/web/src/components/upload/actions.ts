'use server'
import { requireActionContext } from '@/lib/action-context'
import type { ActionResult } from '@/lib/action-result'
import { prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { withActionLog } from '@/lib/with-action-log'
import { type UploadInitInput, initUpload } from '@/server/upload/init-upload'
import type { InitAssetResponse } from '@bebe/media-client'
import { headers } from 'next/headers'

export type StartUploadInput = UploadInitInput

export async function startUpload(
  input: StartUploadInput,
): Promise<ActionResult<InitAssetResponse>> {
  return withActionLog('upload.start', async () => {
    const ctx = await requireActionContext()
    return await initUpload(
      { role: ctx.membership.role, familyId: ctx.family.id, userId: ctx.user.id },
      input,
      { prisma: prismaPublic, media: getMediaClient(), headers: await headers() },
    )
  })
}
