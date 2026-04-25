import type { Asset } from '@bebe/db-media'
import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'
import { buildSignedUrl } from './signed-url'
import { parseDerivativesV2 } from './derivatives-v2'

async function trioFromKeys(
  asset: Asset,
  keys: { avif: string; webp: string; jpeg: string },
): Promise<DerivativeTrio> {
  const [avif, webp, jpeg] = await Promise.all([
    buildSignedUrl({ familyId: asset.familyId, assetId: asset.id, key: keys.avif }),
    buildSignedUrl({ familyId: asset.familyId, assetId: asset.id, key: keys.webp }),
    buildSignedUrl({ familyId: asset.familyId, assetId: asset.id, key: keys.jpeg }),
  ])
  return { avif, webp, jpeg }
}

export async function resolveAssetUrls(asset: Asset): Promise<AssetUrls> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const originalUrl = await buildSignedUrl({
    familyId: asset.familyId,
    assetId: asset.id,
    key: asset.originalKey,
  })

  const aspectRatio =
    asset.aspectRatioCached !== null && asset.aspectRatioCached !== undefined
      ? Number(asset.aspectRatioCached)
      : asset.width && asset.height && asset.width > 0 && asset.height > 0
        ? asset.width / asset.height
        : null

  const derivatives = parseDerivativesV2(asset.derivatives)

  const thumb256 = derivatives?.thumb256
    ? await trioFromKeys(asset, derivatives.thumb256)
    : null
  const thumb512 = derivatives?.thumb512
    ? await trioFromKeys(asset, derivatives.thumb512)
    : null
  const display1080 = derivatives?.display1080
    ? await trioFromKeys(asset, derivatives.display1080)
    : null

  const videoPoster = derivatives?.videoPoster
    ? await buildSignedUrl({
        familyId: asset.familyId,
        assetId: asset.id,
        key: derivatives.videoPoster,
      })
    : null
  const videoCompat = derivatives?.videoCompat
    ? await buildSignedUrl({
        familyId: asset.familyId,
        assetId: asset.id,
        key: derivatives.videoCompat,
      })
    : null

  return {
    blurhash: asset.blurhash ?? null,
    dominantColor: asset.dominantColor ?? null,
    aspectRatio,
    thumb256,
    thumb512,
    display1080,
    original: originalUrl,
    videoPoster,
    videoCompat,
    expiresAt,
  }
}
