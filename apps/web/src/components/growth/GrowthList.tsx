import type { GrowthRecord } from '@bebe/db-public'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export function GrowthList({ records, babyId }: { records: GrowthRecord[]; babyId: string }) {
  const t = useTranslations('misc')
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
                {r.headCm != null && (
                  <span>{t('growth.headValue', { value: Number(r.headCm).toFixed(1) })}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
    </ul>
  )
}
