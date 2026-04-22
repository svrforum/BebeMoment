import type { GrowthRecord } from '@bebe/db'
import Link from 'next/link'

export function GrowthList({
  records,
  babyId,
}: {
  records: GrowthRecord[]
  babyId: string
}) {
  if (records.length === 0) return null
  return (
    <ul className="divide-y rounded-2xl border">
      {records
        .slice()
        .reverse()
        .map((r) => (
          <li key={r.id}>
            <Link
              href={`/babies/${babyId}/growth/${r.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-base-50 dark:hover:bg-base-900"
            >
              <div className="text-sm font-medium">{r.measuredAt.toISOString().slice(0, 10)}</div>
              <div className="flex gap-3 text-xs text-base-500">
                {r.heightCm != null && <span>{Number(r.heightCm).toFixed(1)}cm</span>}
                {r.weightKg != null && <span>{Number(r.weightKg).toFixed(2)}kg</span>}
                {r.headCm != null && <span>머리 {Number(r.headCm).toFixed(1)}cm</span>}
              </div>
            </Link>
          </li>
        ))}
    </ul>
  )
}
