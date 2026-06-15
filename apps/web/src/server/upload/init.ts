import { prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getSetting } from '@/server/settings/get'
import type { InitAssetResponse } from '@bebe/media-client'
import { z } from 'zod'

export type WebInitAssetInput = {
  familyId: string
  uploaderId: string
  mime: string
  sizeBytes: number
  originalName: string
  takenAt?: string
  fileModifiedAt?: string
  clientBlurhash?: string
  clientAspectRatio?: number
  clientWidth?: number
  clientHeight?: number
  notify?: boolean
}

export async function initAssetViaMedia(input: WebInitAssetInput): Promise<InitAssetResponse> {
  const convertToCompatible = await getSetting(
    'upload.convert_to_compatible',
    z.boolean(),
    false,
    prismaPublic,
  )
  const client = getMediaClient()
  return await client.initAsset({ ...input, convertToCompatible })
}
