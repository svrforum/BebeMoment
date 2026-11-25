const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** 바이트 → 사람이 읽는 단위(1024 진법). 음수·NaN·무한대는 '-'. */
export function formatBytes(bytes: number | bigint): string {
  const n = typeof bytes === 'bigint' ? Number(bytes) : bytes
  if (!Number.isFinite(n) || n < 0) return '-'
  let v = n
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${UNITS[i]}`
}
