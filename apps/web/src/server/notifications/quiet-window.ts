/**
 * 그 시각이 조용한 시간 창 안인지. 창은 자정을 넘길 수 있다(23시~7시).
 *
 * 다이제스트 발송 시각이 이 창 안에 있으면 스캔이 매 슬롯을 건너뛰어 푸시가 영구히 안
 * 나간다(`digest.ts` 의 `isDigestSlot` 이 조용한 시간을 먼저 본다). 저장 시점에 막으려고
 * 뽑아 둔다 — 폼은 24시간을 다 고를 수 있게 열어두고 있었다.
 */
export function hourInQuietWindow(hour: number, start: number, end: number): boolean {
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}
