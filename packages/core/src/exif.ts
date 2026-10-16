import exifr from 'exifr'

export type ExifResult = {
  takenAt?: Date
  gpsLat?: number
  gpsLng?: number
  cameraMake?: string
  cameraModel?: string
  raw?: Record<string, unknown>
}

// exifr 는 받은 옵션 객체마다 내부 캐시(Map)에 항목을 남기고 지우지 않는다 — 호출마다 새 리터럴을
// 넘기면 사진 한 장에 수 KB 씩 media 프로세스 메모리가 샌다. 모듈 상수로 한 번만 만든다.
const FULL_OPTIONS = { gps: true, tiff: true }
const DATE_OPTIONS = { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false }

const EXIF_DATE = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/

/**
 * EXIF 날짜('2026:10:12 07:44:52')는 시간대 없는 벽시계다. taken_at 은 그 벽시계를 UTC 필드에
 * 담는다(wall-clock-as-UTC). exifr 가 되살린 Date 는 서버 로컬 시간대로 읽은 순간이라 쓰면 안
 * 된다 — 운영(TZ=Asia/Seoul)에서 9시간 이른 값이 저장돼 아침 사진이 전날로 묶였다.
 */
function exifWallClock(raw: unknown): Date | undefined {
  if (typeof raw !== 'string') return undefined
  const m = EXIF_DATE.exec(raw.trim())
  if (!m) return undefined
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  const date = new Date(`${iso}Z`)
  // '0000:00:00 00:00:00' 같은 자리표시자나 2월 31일은 Date 가 굴려 받아 준다 — 되돌려 맞춰 본다.
  if (Number.isNaN(+date) || date.toISOString().slice(0, 19) !== iso) return undefined
  return date
}

async function exifTakenAt(data: Buffer): Promise<Date | undefined> {
  const dates = (await exifr.parse(data, DATE_OPTIONS)) as Record<string, unknown> | undefined
  return exifWallClock(dates?.DateTimeOriginal) ?? exifWallClock(dates?.CreateDate)
}

export async function parseExif(data: Buffer): Promise<ExifResult> {
  try {
    const parsed = (await exifr.parse(data, FULL_OPTIONS)) as Record<string, unknown> | undefined
    if (!parsed) return {}

    const result: ExifResult = { raw: parsed }
    const takenAt = await exifTakenAt(data)
    if (takenAt) result.takenAt = takenAt
    if (typeof parsed.latitude === 'number') result.gpsLat = parsed.latitude
    if (typeof parsed.longitude === 'number') result.gpsLng = parsed.longitude
    if (typeof parsed.Make === 'string') result.cameraMake = parsed.Make
    if (typeof parsed.Model === 'string') result.cameraModel = parsed.Model
    return result
  } catch {
    return {}
  }
}
