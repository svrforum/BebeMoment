import exifr from 'exifr'

export type ExifResult = {
  takenAt?: Date
  gpsLat?: number
  gpsLng?: number
  cameraMake?: string
  cameraModel?: string
  raw?: Record<string, unknown>
}

export async function parseExif(data: Buffer): Promise<ExifResult> {
  try {
    const parsed = (await exifr.parse(data, { gps: true, tiff: true })) as
      | Record<string, unknown>
      | undefined
    if (!parsed) return {}

    const result: ExifResult = { raw: parsed }
    const dt = parsed.DateTimeOriginal ?? parsed.CreateDate
    if (dt instanceof Date && !Number.isNaN(+dt)) result.takenAt = dt
    if (typeof parsed.latitude === 'number') result.gpsLat = parsed.latitude
    if (typeof parsed.longitude === 'number') result.gpsLng = parsed.longitude
    if (typeof parsed.Make === 'string') result.cameraMake = parsed.Make
    if (typeof parsed.Model === 'string') result.cameraModel = parsed.Model
    return result
  } catch {
    return {}
  }
}
