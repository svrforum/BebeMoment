import { z } from 'zod'

/**
 * 업로드·스토리 제출이 실패했을 때 브라우저가 보내는 진단 보고.
 *
 * 이 흐름의 실패는 대부분 클라이언트에서 끝나 서버에 아무 흔적을 남기지 않는다. 사진이
 * 안 올라간 세 번의 사고를 쫓을 때 서버 로그에는 "업로드가 아예 시작되지 않았다"는
 * 사실조차 없어서, 매번 재현부터 해야 했다. 그래서 실패한 단계와 그 순간의 숫자들을
 * 서버 로그로 넘긴다.
 *
 * 사진 내용·파일명·본문은 보내지 않는다 — 무엇이 몇 개였고 어디서 끊겼는지만 남긴다.
 */
export const uploadReportSchema = z.object({
  /** 어느 화면에서 났는지 */
  flow: z.enum(['upload-sheet', 'timeline-composer', 'story-edit']),
  /** 어디까지 갔는지 */
  step: z.enum(['collect-asset-ids', 'story-post', 'story-patch', 'rollback', 'init', 'unknown']),
  message: z.string().max(500),
  counts: z
    .object({
      staged: z.number().int().min(0).max(10_000).optional(),
      collected: z.number().int().min(0).max(10_000).optional(),
      created: z.number().int().min(0).max(10_000).optional(),
      rolledBack: z.number().int().min(0).max(10_000).optional(),
      rollbackFailed: z.number().int().min(0).max(10_000).optional(),
      stale: z.number().int().min(0).max(10_000).optional(),
    })
    .optional(),
  /** 되돌리지 못한 자산 — 나중에 손으로 찾을 수 있게. 개수는 묶어서 제한. */
  assetIds: z.array(z.string().uuid()).max(50).optional(),
  /** 앱인지 브라우저인지 구분 (UA 전체가 아니라 짧은 라벨) */
  client: z.string().max(80).optional(),
})

export type UploadReport = z.infer<typeof uploadReportSchema>

/**
 * 로그로 넘길 형태로 다듬는다. 메시지는 한 줄로 접고, 길면 자른다 — 스택 트레이스가
 * 통째로 들어와 로그 한 줄이 수 KB 가 되는 걸 막는다.
 */
export function toLogFields(
  report: UploadReport,
  who: { userId: string; familyId: string },
): Record<string, unknown> {
  return {
    userId: who.userId,
    familyId: who.familyId,
    flow: report.flow,
    step: report.step,
    message: report.message.replace(/\s+/g, ' ').trim().slice(0, 300),
    ...(report.counts ?? {}),
    ...(report.assetIds?.length ? { assetIds: report.assetIds } : {}),
    ...(report.client ? { client: report.client } : {}),
  }
}
