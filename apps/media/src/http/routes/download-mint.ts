import { parseDerivativesV2 } from '@/domain/derivatives-v2'
import { type DownloadTokenPayload, signDownloadToken } from '@/lib/jwt'
import { prisma } from '@/lib/prisma'
import { mintDownloadRequest, mintDownloadResponse } from '@bebe/media-client'
import type { FastifyPluginAsync } from 'fastify'
import { MediaHttpError } from '../middleware/error-handler'
import { assertServiceToken } from '../middleware/service-token'

// 다운로드 파일명/mime 을 결정. 사용자는 원본 파일명 그대로 받기를 원하므로 접미사는
// 안 붙이고, 출력 포맷이 원본과 다를 때(MOV→MP4 호환본 등) 확장자만 교체한다.
function replaceExt(filename: string, newExt: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return `${stem}${newExt}`
}

type EffectiveQuality = DownloadTokenPayload['quality']

function deriveFilename(
  original: string,
  quality: Exclude<EffectiveQuality, 'original'>,
): { filename: string; mimeType: string } {
  if (quality === 'gallery') {
    return { filename: original, mimeType: 'image/jpeg' }
  }
  return { filename: replaceExt(original, '.mp4'), mimeType: 'video/mp4' }
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
    const derivatives = parseDerivativesV2(asset.derivatives)

    // auto = "폰에서 열리는 파일을 달라". 원본 코덱이 폰에서 재생되면 원본 바이트를
    // 그대로 주고(화질 유지), 아니면 워커가 이미 만들어 둔 호환본으로 보낸다. 판정
    // 이전에 처리된 자산은 originalPlayable 이 없는데, 그때는 지금까지처럼 원본을 준다
    // — 멀쩡한 자산을 조용히 1080p 로 떨구지 않기 위해서다(백필로 판정을 채운다).
    let effective: EffectiveQuality = quality === 'auto' ? 'original' : quality
    let videoCompatKey: string | undefined
    if (
      quality === 'auto' &&
      kind === 'video' &&
      derivatives?.originalPlayable === false &&
      derivatives.videoCompat
    ) {
      effective = 'compat'
      videoCompatKey = derivatives.videoCompat
    }
    // JPEG 사진의 기본 저장은 갤러리용(회전 굽기·EXIF 제거 — 저장한 사진이 갤러리 맨 위에
    // 보이게). 명시적 original 만 바이트 그대로.
    if (quality === 'auto' && kind === 'image' && asset.mimeType.toLowerCase() === 'image/jpeg') {
      effective = 'gallery'
    }

    const { filename, mimeType } =
      effective === 'original'
        ? { filename: asset.originalFilename, mimeType: asset.mimeType }
        : deriveFilename(asset.originalFilename, effective)

    const token = await signDownloadToken({
      familyId,
      assetId,
      originalKey: asset.originalKey,
      ...(videoCompatKey !== undefined ? { videoCompatKey } : {}),
      kind,
      quality: effective,
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
