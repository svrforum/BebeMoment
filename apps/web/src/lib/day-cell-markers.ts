export type DayCellMarker =
  | { kind: 'story' }
  | { kind: 'schedule'; count: number; showCount: boolean; active: boolean }

/**
 * 날짜 칸 아래줄에 모아 그릴 표식들.
 *
 * ⚠️ 표식은 날짜 숫자와 **같은 줄을 쓰지 않는다**. 우상단에 겹쳐 두었더니 사진이 있는 날의
 * 두 자리 날짜가 배지에 가려 `1(` 처럼 잘렸다(2026-09). 넓어질 수 있는 일정 배지를 맨
 * 뒤에 두어, 줄이 좁아져도 스토리 표식부터 밀리게 한다.
 */
export function dayCellMarkers(args: {
  hasStory: boolean
  scheduleTotal: number
  scheduleRemaining: number
}): DayCellMarker[] {
  const markers: DayCellMarker[] = []
  if (args.hasStory) markers.push({ kind: 'story' })
  if (args.scheduleTotal > 0) {
    markers.push({
      kind: 'schedule',
      count: args.scheduleTotal,
      showCount: args.scheduleTotal > 1,
      active: args.scheduleRemaining > 0,
    })
  }
  return markers
}
