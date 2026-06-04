import type { MilestonePreset } from '@bebe/core'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('misc')
  const categories = ['motor', 'language', 'social', 'cognitive', 'life'] as const
  const categoryLabels: Record<(typeof categories)[number], string> = {
    motor: t('milestone.categoryMotor'),
    language: t('milestone.categoryLanguage'),
    social: t('milestone.categorySocial'),
    cognitive: t('milestone.categoryCognitive'),
    life: t('milestone.categoryLife'),
  }
  return (
    <div className="space-y-6">
      <Link
        href={`/babies/${babyId}/milestones/new`}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-point-500 text-[15px] font-semibold text-white transition active:scale-[0.98] hover:bg-point-600"
      >
        <Plus size={18} strokeWidth={2.4} />
        {t('milestone.addCustom')}
      </Link>
      <section>
        <h2 className="mb-2 text-sm font-medium text-base-500">
          {t('milestone.achieved', { count: achieved.length })}
        </h2>
        {achieved.length === 0 ? (
          <p className="text-xs text-base-500">{t('milestone.noneAchieved')}</p>
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
                      {t('milestone.ageRangeMonths', {
                        from: p.typicalAgeMonths[0],
                        to: p.typicalAgeMonths[1],
                      })}
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
