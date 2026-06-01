import { statfs } from 'node:fs/promises'
import os from 'node:os'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** 바이트 → 사람이 읽는 단위. 음수·NaN 은 '-'. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-'
  let v = n
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${UNITS[i]}`
}

export type DiskOk = { label: string; path: string; total: number; free: number; used: number }
export type DiskErr = { label: string; path: string; error: string }
export type DiskInfo = DiskOk | DiskErr

export type SystemInfo = {
  version: string
  platform: string
  arch: string
  nodeVersion: string
  cpuModel: string
  cpuCount: number
  mem: { total: number; free: number; used: number }
  uptimeSec: number
  disks: DiskInfo[]
}

async function diskFor(label: string, path: string): Promise<DiskInfo> {
  try {
    const s = await statfs(path)
    const total = s.blocks * s.bsize
    // bavail = 비-루트 사용자가 실제로 쓸 수 있는 블록(예약분 제외).
    const free = s.bavail * s.bsize
    return { label, path, total, free, used: total - free }
  } catch (e) {
    return { label, path, error: (e as Error).message }
  }
}

/** 인스턴스 구동 스펙·자원 현황. `dirs` 의 각 경로에 대해 디스크 용량을 조회한다. */
export async function getSystemInfo(dirs: { label: string; path: string }[]): Promise<SystemInfo> {
  const cpus = os.cpus()
  const total = os.totalmem()
  const free = os.freemem()
  const disks = await Promise.all(dirs.map((d) => diskFor(d.label, d.path)))
  return {
    version: process.env.APP_VERSION ?? 'dev',
    platform: `${os.type()} ${os.release()}`,
    arch: process.arch,
    nodeVersion: process.version,
    cpuModel: cpus[0]?.model?.trim() ?? 'unknown',
    cpuCount: cpus.length,
    mem: { total, free, used: total - free },
    uptimeSec: Math.round(process.uptime()),
    disks,
  }
}
