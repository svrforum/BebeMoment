import { parseDerivativesV2 } from '@/domain/derivatives-v2'
import { signDownloadToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { mintDownloadRequest, mintDownloadResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

// quality 별 다운로드 파일명/mime 을 결정. 비디오 트랜스코드 산출물은 mp4,
// 이미지 라이브 리사이즈 산출물은 jpeg.
function deriveFilename(
  original: string,
  kind: 'image' | 'video',
  quality: 'original' | 'hd' | 'sd',
): { filename: string; mimeType: string } {
  if (quality === 'original') {
    return { filename: original, mimeType: '' }
  }
  // 확장자를 떼고 quality 접미사 + 새 확장자로 교체.
  const dot = original.lastIndexOf('.')
  const stem = dot > 0 ? original.slice(0, dot) : original
  if (kind === 'video') {
    const suffix = quality === 'hd' ? '_1080p' : '_720p'
    return { filename: `${stem}${suffix}.mp4`, mimeType: 'video/mp4' }
  }
  const suffix = quality === 'hd' ? '_1080' : '_720'
  return { filename: `${stem}${suffix}.jpg`, mimeType: 'image/jpeg' }
}

export const downloadMintRoute: FastifyPluginAsync = async (app) => {
  app.post('/media/v1/download/mint', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { familyId, assetId, quality } = mintDownloadRequest.parse(req.body)

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, familyId, deletedAt: null },
    })
    if (!asset) {
      throw new MediaHttpError({
        code: 'ASSET_NOT_FOUND',
        status: 404,
        message: 'asset 을 찾을 수 없어요',
        retriable: false,
      })
    }

    const kind: 'image' | 'video' = asset.kind === 'video' ? 'video' : 'image'
    const { filename: derivedName, mimeType: derivedMime } = deriveFilename(
      asset.originalFilename,
      kind,
      quality,
    )
    const filename = quality === 'original' ? asset.originalFilename : derivedName
    const mimeType = quality === 'original' ? asset.mimeType : derivedMime

    // 이미지 + HD 면 사전 생성된 display1080.jpeg 가 있는지 확인. 있으면
    // 그 키를 토큰에 박아 두고, 다운로드 라우트는 라이브 리사이즈 없이
    // 그대로 스트리밍한다.
    let hdImageKey: string | undefined
    if (kind === 'image' && quality === 'hd') {
      const derivatives = parseDerivativesV2(asset.derivatives)
      hdImageKey = derivatives?.display1080?.jpeg
    }

    const token = await signDownloadToken({
      familyId,
      assetId,
      originalKey: asset.originalKey,
      ...(hdImageKey !== undefined ? { hdImageKey } : {}),
      kind,
      quality,
      filename,
      mimeType,
    })

    const base = (
      process.env.MEDIA_PUBLIC_BASE_URL ||
      process.env.PUBLIC_URL ||
      'http://localhost:3001'
    ).replace(/\/$/, '')
    const url = `${base}/media/v1/download/${token}`
    const payload = mintDownloadResponse.parse({ v: 1, url })
    reply.status(200).send(payload)
  })
}
