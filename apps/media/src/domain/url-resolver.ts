import type { Asset } from '@bebe/db-media'
import type { AssetUrls } from '@bebe/media-client'
import { buildSignedUrl } from './signed-url'

export async function resolveAssetUrls(asset: Asset): Promise<AssetUrls> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const originalUrl = await buildSignedUrl({
    familyId: asset.familyId,
    assetId: asset.id,
    key: asset.originalKey,
  })

  const aspectRatio =
    asset.width && asset.height && asset.width > 0 && asset.height > 0
      ? asset.width / asset.height
      : null

  return {
    blurhash: null,
    dominantColor: null,
    aspectRatio,
    thumb256: null,
    thumb512: null,
    display1080: null,
    original: originalUrl,
    videoPoster: null,
    videoCompat: null,
    expiresAt,
  }
}
