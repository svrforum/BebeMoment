import { Calendar, Camera, Image as ImgIcon, MapPin, User } from 'lucide-react'

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

export function MetadataSection(p: Props) {
  const mime = p.mimeType.split('/').pop()?.toUpperCase() ?? p.mimeType
  const camera =
    p.cameraMake || p.cameraModel ? `${p.cameraMake ?? ''} ${p.cameraModel ?? ''}`.trim() : null
  const exposure = formatExposure(p.exifRaw)

  return (
    <dl className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <Calendar size={16} className="mt-0.5 text-base-500" />
        <div>
          <div>{p.takenAt.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })}</div>
          {p.takenAtSource !== 'exif' && (
            <div className="text-xs text-base-500">({p.takenAtSource})</div>
          )}
        </div>
      </div>
      {camera && (
        <div className="flex items-start gap-2">
          <Camera size={16} className="mt-0.5 text-base-500" />
          <div>
            <div>{camera}</div>
            {exposure && <div className="text-xs text-base-500">{exposure}</div>}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <ImgIcon size={16} className="text-base-500" />
        <span>
          {p.width && p.height ? `${p.width} × ${p.height} · ` : ''}
          {formatSize(p.sizeBytes)} {mime}
        </span>
      </div>
      {p.gpsLat != null && p.gpsLng != null && (
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-base-500" />
          <span className="tabular-nums">
            {p.gpsLat.toFixed(4)}, {p.gpsLng.toFixed(4)}
          </span>
        </div>
      )}
      {p.babies.length > 0 && (
        <div className="flex items-start gap-2">
          <User size={16} className="mt-0.5 text-base-500" />
          <div>{p.babies.map((b) => b.name).join(', ')}</div>
        </div>
      )}
    </dl>
  )
}
