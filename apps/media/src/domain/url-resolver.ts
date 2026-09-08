import type { Asset } from '@bebe/db-media'
import type { AssetUrlTier, AssetUrls, DerivativeTrio } from '@bebe/media-client'
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

export type ResolveAssetUrlsOptions = {
  /** 서명할 티어. 생략하면 전부(기존 동작). 지정한 티어 밖은 서명하지 않고 null 로 나간다. */
  tiers?: readonly AssetUrlTier[]
}

export async function resolveAssetUrls(
  asset: Asset,
  opts?: ResolveAssetUrlsOptions,
): Promise<AssetUrls> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const derivatives = parseDerivativesV2(asset.derivatives)
  const sign = signerFor(asset)

  const tiers = opts?.tiers
  const want = (tier: AssetUrlTier): boolean => tiers === undefined || tiers.includes(tier)
  // 파생물이 하나도 없는 자산(레거시 v1 · 아직 처리 중)은 원본이 유일한 표시 경로다.
  // 티어를 좁혔다고 여기서 원본까지 지우면 그 자산은 그리드에서 빈 타일이 된다.
  const wantOriginal = want('original') || derivatives === null

  // Sign every URL for this asset in parallel — was 4× sequential awaits
  // (original → thumb256 → thumb512 → display1080) which dominated batch
  // resolution wall time. JWT signing is CPU-bound but cheap; doing it in
  // parallel lets a single-asset call finish in one tick.
  const [originalUrl, thumb256, thumb512, display1080, videoPoster, videoCompat] =
    await Promise.all([
      wantOriginal ? sign(asset.originalKey) : Promise.resolve(null),
      want('thumb') && derivatives?.thumb256
        ? trioFromKeys(sign, derivatives.thumb256)
        : Promise.resolve(null),
      want('thumb') && derivatives?.thumb512
        ? trioFromKeys(sign, derivatives.thumb512)
        : Promise.resolve(null),
      want('display') && derivatives?.display1080
        ? trioFromKeys(sign, derivatives.display1080)
        : Promise.resolve(null),
      want('video') && derivatives?.videoPoster
        ? sign(derivatives.videoPoster)
        : Promise.resolve(null),
      want('video') && derivatives?.videoCompat
        ? sign(derivatives.videoCompat)
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
