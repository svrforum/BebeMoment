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
  quality: 'original' | 'compat' | 'hd' | 'sd',
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
    const derivatives = parseDerivativesV2(asset.derivatives)

    // auto = "폰에서 열리는 파일을 달라". 원본 코덱이 폰에서 재생되면 원본 바이트를
    // 그대로 주고(화질 유지), 아니면 워커가 이미 만들어 둔 호환본으로 보낸다. 판정
    // 이전에 처리된 자산은 originalPlayable 이 없는데, 그때는 지금까지처럼 원본을 준다
    // — 멀쩡한 자산을 조용히 1080p 로 떨구지 않기 위해서다(백필로 판정을 채운다).
    let effective: 'original' | 'compat' | 'hd' | 'sd' = quality === 'auto' ? 'original' : quality
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

    const { filename: derivedName, mimeType: derivedMime } = deriveFilename(
      asset.originalFilename,
      kind,
      effective,
    )
    const filename = effective === 'original' ? asset.originalFilename : derivedName
    const mimeType = effective === 'original' ? asset.mimeType : derivedMime

    // 이미지 + HD 면 사전 생성된 display1080.jpeg 가 있는지 확인. 있으면
    // 그 키를 토큰에 박아 두고, 다운로드 라우트는 라이브 리사이즈 없이
    // 그대로 스트리밍한다.
    let hdImageKey: string | undefined
    if (kind === 'image' && effective === 'hd') {
      hdImageKey = derivatives?.display1080?.jpeg
    }

    const token = await signDownloadToken({
      familyId,
      assetId,
      originalKey: asset.originalKey,
      ...(hdImageKey !== undefined ? { hdImageKey } : {}),
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
