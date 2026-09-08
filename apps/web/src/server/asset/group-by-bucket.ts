import { type AgeBucket, ageBucket } from '@bebe/core'

export type AssetLike = {
  id: string
  takenAt: Date
}

export type BucketGroup<T extends AssetLike> = {
  bucket: AgeBucket
  assets: T[]
}

/**
 * 나이 버킷별 묶음. 버킷 라벨은 로케일마다 다르므로 여기서는 문자열이 아니라 버킷 자체를
 * 들고 있는다 — 표기는 호출부가 `formatAgeBucket(bucket, t)` 로 만든다.
 */
export function groupAssetsByBucket<T extends AssetLike>(
  assets: T[],
  babyBirthDate: Date,
): BucketGroup<T>[] {
  const sorted = [...assets].sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
  const groups: BucketGroup<T>[] = []
  let current: BucketGroup<T> | null = null

  for (const a of sorted) {
    const bucket = ageBucket(babyBirthDate, a.takenAt)
    if (!current || bucketKey(current.bucket) !== bucketKey(bucket)) {
      current = { bucket, assets: [] }
      groups.push(current)
    }
    current.assets.push(a)
  }
  return groups
}

function bucketKey(b: AgeBucket): string {
  return `${b.kind}:${b.n}`
}
