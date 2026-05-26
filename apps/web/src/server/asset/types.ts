import type { Asset } from '@bebe/db-media'
import type { AssetUrls } from '@bebe/media-client'

export type AssetWithUrls = Asset & { urls: AssetUrls | null }
