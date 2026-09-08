import { statfs } from 'node:fs/promises'

export type StatfsFn = (dir: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>

const MARGIN_BYTES = 256n * 1024n * 1024n

// 업로드 바이트는 스토리지 모드와 무관하게 먼저 로컬 tus-tmp 에 쌓인다. 로컬 스토리지면
// 그 위에 원본 이동 + 파생물 여유(~1.5x)가 더 필요하고, S3 면 tus-tmp 의 임시 복사본만
// 잠시 머문다(1.0x). 어느 쪽이든 +256MB 마진.
export function bytesNeededForUpload(sizeBytes: number, mode: 'local' | 's3'): bigint {
  const size = BigInt(sizeBytes)
  const withHeadroom = mode === 'local' ? (size * 3n) / 2n : size
  return withHeadroom + MARGIN_BYTES
}

/** 꽉 찬 디스크에서 업로드를 시작하면 tus-tmp·파생물·DB 가 깨진다 — init 에서 거부한다.
 *  statfs 미지원/오류는 가용성 우선으로 통과시킨다. */
export async function assertDiskSpaceForUpload(
  args: { sizeBytes: number; mode: 'local' | 's3'; tusTmpDir: string },
  statfsFn: StatfsFn = statfs,
): Promise<void> {
  let free: bigint
  try {
    const s = await statfsFn(args.tusTmpDir)
    free = BigInt(s.bavail) * BigInt(s.bsize)
  } catch {
    return
  }
  if (free < bytesNeededForUpload(args.sizeBytes, args.mode)) {
    throw new Error('insufficient disk space for upload')
  }
}
