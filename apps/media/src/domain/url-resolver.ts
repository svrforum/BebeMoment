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
  const derivatives = parseDerivativesV2(asset.derivatives)

  // Sign every URL for this asset in parallel — was 4× sequential awaits
  // (original → thumb256 → thumb512 → display1080) which dominated batch
  // resolution wall time. JWT signing is CPU-bound but cheap; doing it in
  // parallel lets a single-asset call finish in one tick.
  const [originalUrl, thumb256, thumb512, display1080, videoPoster, videoCompat] =
    await Promise.all([
      buildSignedUrl({
        familyId: asset.familyId,
        assetId: asset.id,
        key: asset.originalKey,
      }),
      derivatives?.thumb256 ? trioFromKeys(asset, derivatives.thumb256) : Promise.resolve(null),
      derivatives?.thumb512 ? trioFromKeys(asset, derivatives.thumb512) : Promise.resolve(null),
      derivatives?.display1080
        ? trioFromKeys(asset, derivatives.display1080)
        : Promise.resolve(null),
      derivatives?.videoPoster
        ? buildSignedUrl({
            familyId: asset.familyId,
            assetId: asset.id,
            key: derivatives.videoPoster,
          })
        : Promise.resolve(null),
      derivatives?.videoCompat
        ? buildSignedUrl({
            familyId: asset.familyId,
            assetId: asset.id,
            key: derivatives.videoCompat,
          })
        : Promise.resolve(null),
    ])

  const aspectRatio =
    asset.aspectRatioCached !== null && asset.aspectRatioCached !== undefined
      ? Number(asset.aspectRatioCached)
      : asset.width && asset.height && asset.width > 0 && asset.height > 0
        ? asset.width / asset.height
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
