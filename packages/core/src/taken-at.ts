export type TakenAtSource = 'exif' | 'filename' | 'filemtime' | 'uploaded'

export type DeriveTakenAtInput = {
  exifDateTimeOriginal?: Date
  filename: string
  fileModifiedAt?: Date
  uploadedAt: Date
}

export type TakenAtResult = { value: Date; source: TakenAtSource }

const PATTERN = /(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/

export function deriveTakenAt(input: DeriveTakenAtInput): TakenAtResult {
  if (input.exifDateTimeOriginal && !Number.isNaN(+input.exifDateTimeOriginal)) {
    return { value: input.exifDateTimeOriginal, source: 'exif' }
  }
  const match = PATTERN.exec(input.filename)
  if (match) {
    const [, y, mo, d, h, mi, s] = match
    const parsed = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
    if (!Number.isNaN(+parsed)) return { value: parsed, source: 'filename' }
  }
  if (input.fileModifiedAt && !Number.isNaN(+input.fileModifiedAt)) {
    return { value: input.fileModifiedAt, source: 'filemtime' }
  }
  return { value: input.uploadedAt, source: 'uploaded' }
}
