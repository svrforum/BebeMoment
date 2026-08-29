// 영상은 EXIF 가 없다. 촬영시각은 컨테이너 메타데이터(ffprobe format.tags)에 들어 있고,
// 안 읽으면 파일명·파일수정시각으로 폴백하는데 — 안드로이드 앱의 파일 선택기가 둘 다
// 망가뜨려서(이름이 숫자로, mtime 이 업로드 시각으로) 결국 "올린 날"이 촬영일이 된다.

/** 컨테이너가 지어낸 자리표시자. 이 언저리 값은 촬영시각이 아니다. */
const PLACEHOLDER_BEFORE = Date.UTC(1980, 0, 1)

type Tags = Record<string, unknown> | undefined

/** 인스턴스 시간대에서의 벽시계 컴포넌트를 뽑는다. */
function wallClockInZone(instant: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  // hour12:false 는 자정을 24 로 주는 구현이 있다 — 0 으로 접는다.
  const hour = get('hour') % 24
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second')),
  )
}

function firstString(tags: Tags, keys: string[]): string | undefined {
  if (!tags) return undefined
  for (const k of keys) {
    const v = tags[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

/**
 * ffprobe 의 format.tags 에서 촬영시각을 뽑아 **벽시계-as-UTC** 로 돌려준다
 * (`media.assets.taken_at` 의 저장 규칙 — 사진 EXIF 와 같은 축).
 *
 * ⚠️ MP4 의 `creation_time` 은 진짜 UTC 라 그대로 쓰면 촬영 지역만큼 어긋난다(한국이면
 * 9시간, 자정 근처면 날짜까지). 그래서 인스턴스 시간대의 벽시계로 옮겨 담는다.
 * 반면 퀵타임 계열의 `creationdate` 는 오프셋을 달고 오므로 그 지역 벽시계를 그대로 쓴다
 * — 여행지에서 찍은 영상이 집 시간대로 끌려가지 않게.
 */
export function videoCreatedAt(tags: Tags, timeZone: string): Date | undefined {
  const withOffset = firstString(tags, ['com.apple.quicktime.creationdate', 'date', 'date_eng'])
  const utc = firstString(tags, ['creation_time'])
  // 일부 기기(삼성 등)는 UTC 촬영시각과 별개로 촬영 당시 오프셋을 남긴다. 있으면
  // 인스턴스 시간대를 가정하는 것보다 정확하다 — 여행지에서 찍은 영상도 현지 시각이 된다.
  const offsetMin = parseOffsetMinutes(
    firstString(tags, ['com.samsung.android.utc_offset', 'com.android.utc_offset']),
  )

  for (const [raw, isOffsetForm] of [
    [withOffset, true],
    [utc, false],
  ] as const) {
    if (!raw) continue
    // "+0900" 처럼 콜론 없는 오프셋은 Date 가 못 읽는 구현이 있다 — 정규화.
    const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    const parsed = new Date(normalized)
    if (Number.isNaN(+parsed)) continue
    if (+parsed < PLACEHOLDER_BEFORE) continue
    // 미래 값은 메타데이터가 깨진 것 — 폴백에 맡긴다(하루는 기기 시계 오차 여유).
    if (+parsed > Date.now() + 24 * 60 * 60 * 1000) continue

    if (isOffsetForm) {
      // 오프셋이 있으면 그 지역 벽시계가 곧 촬영시각이다.
      const m = /([+-]\d{2}):?(\d{2})$/.exec(raw)
      if (!m) return wallClockInZone(parsed, timeZone)
      const offsetMin = (Number(m[1]) < 0 ? -1 : 1) * (Math.abs(Number(m[1])) * 60 + Number(m[2]))
      return new Date(+parsed + offsetMin * 60_000)
    }
    if (offsetMin !== undefined) return new Date(+parsed + offsetMin * 60_000)
    return wallClockInZone(parsed, timeZone)
  }
  return undefined
}

/** "+0900" / "-07:00" → 분. 형식이 아니면 undefined. */
function parseOffsetMinutes(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(raw.trim())
  if (!m) return undefined
  const mins = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -mins : mins
}
