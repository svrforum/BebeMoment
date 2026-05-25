import { Camera, Image as ImgIcon, MapPin, User } from 'lucide-react'

type Props = {
  takenAt: Date
  takenAtSource: string
  width: number | null
  height: number | null
  sizeBytes: bigint | number
  mimeType: string
  cameraMake: string | null
  cameraModel: string | null
  gpsLat: number | null
  gpsLng: number | null
  exifRaw: Record<string, unknown> | null
  babies: { id: string; name: string }[]
}

function formatSize(b: bigint | number): string {
  const n = typeof b === 'bigint' ? Number(b) : b
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatExposure(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null
  const parts: string[] = []
  const f = raw.FNumber
  if (typeof f === 'number') parts.push(`f/${f}`)
  const expVal = raw.ExposureTime
  if (typeof expVal === 'number') {
    if (expVal >= 1) parts.push(`${expVal}s`)
    else parts.push(`1/${Math.round(1 / expVal)}`)
  }
  const iso = raw.ISOSpeedRatings ?? raw.ISO
  if (typeof iso === 'number') parts.push(`ISO ${iso}`)
  return parts.length > 0 ? parts.join(' ') : null
}

type RowProps = {
  icon: React.ReactNode
  primary: React.ReactNode
  secondary?: React.ReactNode
  last?: boolean
}

function Row({ icon, primary, secondary, last }: RowProps) {
  return (
    <div
      className={`flex items-start gap-3 py-2.5 ${
        last ? '' : 'border-b border-base-100 dark:border-base-800/60'
      }`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-base-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-base-900 dark:text-base-100">{primary}</div>
        {secondary && <div className="mt-0.5 text-[12px] text-base-500">{secondary}</div>}
      </div>
    </div>
  )
}

export function MetadataSection(p: Props) {
  const mime = p.mimeType.split('/').pop()?.toUpperCase() ?? p.mimeType
  const camera =
    p.cameraMake || p.cameraModel ? `${p.cameraMake ?? ''} ${p.cameraModel ?? ''}`.trim() : null
  const exposure = formatExposure(p.exifRaw)
  const dimensions = p.width && p.height ? `${p.width} × ${p.height}` : null

  // Determine which row is last to skip its bottom border.
  // Date is now in MetadataEditor — this section is read-only EXIF / stats.
  const rows: Array<keyof typeof flags> = []
  const flags = {
    camera: !!camera,
    image: true,
    gps: p.gpsLat != null && p.gpsLng != null,
    babies: p.babies.length > 0,
  }
  for (const k of Object.keys(flags) as Array<keyof typeof flags>) {
    if (flags[k]) rows.push(k)
  }
  const lastKey = rows[rows.length - 1]
  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl bg-base-50/50 px-4 py-1 dark:bg-base-950/40">
      {camera && (
        <Row
          icon={<Camera size={15} strokeWidth={1.9} />}
          primary={camera}
          secondary={exposure ?? undefined}
          last={lastKey === 'camera'}
        />
      )}
      <Row
        icon={<ImgIcon size={15} strokeWidth={1.9} />}
        primary={
          <span className="tabular-nums">
            {dimensions ? `${dimensions} · ` : ''}
            {formatSize(p.sizeBytes)} {mime}
          </span>
        }
        last={lastKey === 'image'}
      />
      {p.gpsLat != null && p.gpsLng != null && (
        <Row
          icon={<MapPin size={15} strokeWidth={1.9} />}
          primary={
            <span className="tabular-nums">
              {p.gpsLat.toFixed(4)}, {p.gpsLng.toFixed(4)}
            </span>
          }
          last={lastKey === 'gps'}
        />
      )}
      {p.babies.length > 0 && (
        <Row
          icon={<User size={15} strokeWidth={1.9} />}
          primary={p.babies.map((b) => b.name).join(', ')}
          last={lastKey === 'babies'}
        />
      )}
    </div>
  )
}
