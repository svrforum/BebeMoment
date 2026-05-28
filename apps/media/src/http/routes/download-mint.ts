import { parseDerivativesV2 } from '@/domain/derivatives-v2'
import { signDownloadToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { mintDownloadRequest, mintDownloadResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

// quality 별 다운로드 파일명/mime 을 결정. 사용자는 원본 파일명 그대로 받기를
// 원하므로 `_1080`/`_720p` 접미사는 안 붙인다. 단 출력 포맷이 원본과 다르면
// (HEIC→JPEG / MOV→MP4 등) 확장자만 적절히 교체 — 같은 확장자면 그대로 둔다.
function replaceExt(filename: string, newExt: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return `${stem}${newExt}`
}

function deriveFilename(
  original: string,
  kind: 'image' | 'video',
  quality: 'original' | 'hd' | 'sd',
): { filename: string; mimeType: string } {
  if (quality === 'original') {
    return { filename: original, mimeType: '' }
  }
  if (kind === 'video') {
    return { filename: replaceExt(original, '.mp4'), mimeType: 'video/mp4' }
  }
  return { filename: replaceExt(original, '.jpg'), mimeType: 'image/jpeg' }
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
