import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

/**
 * 중단된 tus 업로드의 디스크 임시파일 정리. assets/init 은 업로드마다
 * `tus-tmp/<assetId>`(+ `<assetId>.json` 사이드카)를 미리 만든다. moveTusToFinal
 * 은 성공한 업로드만 임시파일을 옮겨 지우므로, 중단·만료된 업로드의 임시파일은
 * 그대로 쌓인다(reapStaleUploads 는 DB 행만 정리). 토큰 TTL(15분)을 한참 넘긴
 * 임시파일을 지운다 — Synology NAS 디스크/inode 무한 증가 방지. 반환=정리한 항목 수.
 */
export async function reapStaleTusTmp(
  storagePath: string,
  olderThanMs: number = SIX_HOURS_MS,
): Promise<number> {
  const dir = path.join(storagePath, 'tus-tmp')
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw err
  }
  const cutoff = Date.now() - olderThanMs
  let removed = 0
  await Promise.all(
    entries.map(async (name) => {
      const p = path.join(dir, name)
      try {
        const s = await stat(p)
        if (s.mtimeMs < cutoff) {
          await rm(p, { force: true })
          removed++
        }
      } catch {
        // best-effort — 경쟁적으로 사라졌거나 stat 실패 시 건너뜀
      }
    }),
  )
  return removed
}
