import type { Asset } from '@bebe/db-media'
import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'
import { parseDerivativesV2 } from './derivatives-v2'
import { buildSignedUrl } from './signed-url'

type SignKey = (key: string) => Promise<string>

// 한 자산 안에서 같은 키는 한 번만 서명한다 — AVIF 를 끈 인스턴스는 avif 슬롯에 webp 키가
// 들어 있어 티어마다 같은 키를 두 번 서명했고, 영상은 videoCompat 이 원본 키일 수 있다.
function signerFor(asset: Asset): SignKey {
  const signed = new Map<string, Promise<string>>()
  return (key) => {
    let p = signed.get(key)
    if (!p) {
      p = buildSignedUrl({ familyId: asset.familyId, assetId: asset.id, key })
      signed.set(key, p)
    }
    return p
  }
}

async function trioFromKeys(
  sign: SignKey,
  keys: { avif: string; webp: string; jpeg: string },
): Promise<DerivativeTrio> {
  const [avif, webp, jpeg] = await Promise.all([sign(keys.avif), sign(keys.webp), sign(keys.jpeg)])
  return { avif, webp, jpeg }
}

export async function resolveAssetUrls(asset: Asset): Promise<AssetUrls> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const derivatives = parseDerivativesV2(asset.derivatives)
  const sign = signerFor(asset)

  // Sign every URL for this asset in parallel — was 4× sequential awaits
  // (original → thumb256 → thumb512 → display1080) which dominated batch
  // resolution wall time. JWT signing is CPU-bound but cheap; doing it in
  // parallel lets a single-asset call finish in one tick.
  const [originalUrl, thumb256, thumb512, display1080, videoPoster, videoCompat] =
    await Promise.all([
      sign(asset.originalKey),
      derivatives?.thumb256 ? trioFromKeys(sign, derivatives.thumb256) : Promise.resolve(null),
      derivatives?.thumb512 ? trioFromKeys(sign, derivatives.thumb512) : Promise.resolve(null),
      derivatives?.display1080
        ? trioFromKeys(sign, derivatives.display1080)
        : Promise.resolve(null),
      derivatives?.videoPoster ? sign(derivatives.videoPoster) : Promise.resolve(null),
      derivatives?.videoCompat ? sign(derivatives.videoCompat) : Promise.resolve(null),
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
