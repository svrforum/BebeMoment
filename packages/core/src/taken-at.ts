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

/**
 * 실제 순간을 이 프로세스의 벽시계(서버는 인스턴스 TZ, 브라우저는 기기 시간대)로 옮겨 UTC 필드에
 * 담는다 — taken_at 의 저장 규칙(wall-clock-as-UTC). 파일 수정시각·업로드 시각·지금처럼 실제 순간만
 * 아는 값을 촬영 시각과 같은 축에 둘 때 쓴다. 시간대 이름을 Intl 에 넘기지 않고 Node 의 로컬 getter 를
 * 쓴다 — 'KST-9'·':/etc/localtime' 같은 TZ 표기를 Node 는 알아듣지만 Intl 은 RangeError 를 낸다.
 */
export function wallClockAsUtc(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getFullYear(),
      instant.getMonth(),
      instant.getDate(),
      instant.getHours(),
      instant.getMinutes(),
      instant.getSeconds(),
      instant.getMilliseconds(),
    ),
  )
}
