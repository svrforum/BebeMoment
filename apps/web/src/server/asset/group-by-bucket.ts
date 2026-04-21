import { bucketLabel } from '@bebe/core'

export type AssetLike = {
  id: string
  takenAt: Date
}

export type BucketGroup<T extends AssetLike> = {
  label: string
  assets: T[]
}

export function groupAssetsByBucket<T extends AssetLike>(
  assets: T[],
  babyBirthDate: Date,
): BucketGroup<T>[] {
  const sorted = [...assets].sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
  const groups: BucketGroup<T>[] = []
  let current: BucketGroup<T> | null = null

  for (const a of sorted) {
    const label = bucketLabel(babyBirthDate, a.takenAt)
    if (!current || current.label !== label) {
      current = { label, assets: [] }
      groups.push(current)
    }
    current.assets.push(a)
  }
  return groups
}
