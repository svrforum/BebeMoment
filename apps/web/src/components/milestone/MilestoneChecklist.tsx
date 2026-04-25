import type { MilestonePreset } from '@bebe/core'
import Link from 'next/link'

export function MilestoneChecklist({
  presets,
  babyId,
  achieved,
}: {
  presets: (MilestonePreset & { taken: boolean })[]
  babyId: string
  achieved: { id: string; labelKo: string; achievedAt: Date; presetKey: string | null }[]
}) {
  const categories = ['motor', 'language', 'social', 'cognitive', 'life'] as const
  const categoryLabels: Record<(typeof categories)[number], string> = {
    motor: '운동',
    language: '언어',
    social: '사회성',
    cognitive: '인지',
    life: '생활',
  }
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium text-base-500">달성 ({achieved.length})</h2>
        {achieved.length === 0 ? (
          <p className="text-xs text-base-500">아직 달성한 마일스톤이 없어요.</p>
        ) : (
          <ul className="divide-y divide-base-200 rounded-2xl border border-base-200 dark:divide-base-800 dark:border-base-800">
            {achieved.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/babies/${babyId}/milestones/${a.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-base-50 dark:hover:bg-base-900"
                >
                  <span>{a.labelKo}</span>
                  <span className="text-xs text-base-500">
                    {a.achievedAt.toISOString().slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {categories.map((cat) => {
        const rows = presets.filter((p) => p.category === cat && !p.taken)
        if (rows.length === 0) return null
        return (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-medium text-base-500">{categoryLabels[cat]}</h2>
            <ul className="divide-y divide-base-200 rounded-2xl border border-base-200 dark:divide-base-800 dark:border-base-800">
              {rows.map((p) => (
                <li key={p.key}>
                  <Link
                    href={`/babies/${babyId}/milestones/new?presetKey=${encodeURIComponent(p.key)}`}
                    className="flex items-center justify-between px-4 py-3 text-base-500 hover:bg-base-50 dark:hover:bg-base-900"
                  >
                    <span>{p.labelKo}</span>
                    <span className="text-xs">
                      {p.typicalAgeMonths[0]}–{p.typicalAgeMonths[1]}개월
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
