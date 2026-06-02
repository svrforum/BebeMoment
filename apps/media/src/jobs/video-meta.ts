type VideoStreamMeta = {
  width?: number | undefined
  height?: number | undefined
  tags?: Record<string, unknown> | undefined
  side_data_list?: Array<Record<string, unknown>> | undefined
}

/** ffprobe 의 format.duration 은 보통 "12.5" 지만 컨테이너에 따라 "N/A"·누락도 나온다.
 *  Number("N/A")=NaN 을 그대로 Math.round 하면 durationMs=NaN → Prisma Int 거부로
 *  자산 전체가 실패한다. 유한·양수만 ms 로, 아니면 0. */
export function parseDurationMs(raw: unknown): number {
  const d = Number(raw)
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : 0
}

/** 스트림의 회전 각도를 0..359 로 정규화. 최신 ffmpeg 은 side_data 의 Display Matrix
 *  rotation(보통 음수, 예: 세로 영상 -90)을, 구버전은 tags.rotate 를 쓴다. */
export function streamRotation(stream: VideoStreamMeta | undefined): number {
  if (!stream) return 0
  const sd = stream.side_data_list?.find((s) => 'rotation' in s)
  let rot = sd ? Number(sd.rotation) : Number(stream.tags?.rotate ?? 0)
  if (!Number.isFinite(rot)) rot = 0
  return ((Math.round(rot) % 360) + 360) % 360
}

/** 회전 메타를 반영한 표시 치수. 90/270° 면 width/height 를 스왑한다 — 세로로 찍은
 *  폰 영상은 스트림에 가로 치수 + 회전 태그로 저장돼, 스왑 없이는 aspect ratio 가
 *  가로로 잘못 예약돼 CLS·레이아웃 오류가 난다(포스터는 ffmpeg 이 자동 회전 적용). */
export function orientedDimensions(stream: VideoStreamMeta | undefined): {
  width: number | undefined
  height: number | undefined
} {
  const w = stream?.width
  const h = stream?.height
  const rot = streamRotation(stream)
  if ((rot === 90 || rot === 270) && w !== undefined && h !== undefined) {
    return { width: h, height: w }
  }
  return { width: w, height: h }
}
