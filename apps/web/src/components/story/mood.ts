// Diary moods are stored as enum strings on the row. Keep emoji +
// color tone in one place so detail / card / form share the same vocab.
// 라벨은 i18n(`story.mood.<key>`)으로 소비 지점에서 해석한다.
// `tint` drives the hero gradient on the detail page; `chip` drives the
// inline mood pill.
export const MOODS = {
  happy: {
    emoji: '😊',
    tint: 'from-amber-100 via-amber-50 to-base-0 dark:from-amber-500/20 dark:via-amber-500/5 dark:to-transparent',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  grateful: {
    emoji: '🙏',
    tint: 'from-rose-100 via-rose-50 to-base-0 dark:from-rose-500/20 dark:via-rose-500/5 dark:to-transparent',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  },
  tired: {
    emoji: '😪',
    tint: 'from-slate-200 via-slate-100 to-base-0 dark:from-slate-500/20 dark:via-slate-500/5 dark:to-transparent',
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  },
  sad: {
    emoji: '😢',
    tint: 'from-sky-100 via-sky-50 to-base-0 dark:from-sky-500/20 dark:via-sky-500/5 dark:to-transparent',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  proud: {
    emoji: '✨',
    tint: 'from-violet-100 via-violet-50 to-base-0 dark:from-violet-500/20 dark:via-violet-500/5 dark:to-transparent',
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  },
  calm: {
    emoji: '😌',
    tint: 'from-teal-100 via-teal-50 to-base-0 dark:from-teal-500/20 dark:via-teal-500/5 dark:to-transparent',
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
  },
} as const

export type Mood = keyof typeof MOODS

export function isMood(v: string | null | undefined): v is Mood {
  return v != null && v in MOODS
}
