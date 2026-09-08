'use client'
import { useToast } from '@/lib/toast'
import type { PersonSummary } from '@/server/people/list'
import { Check, Users, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PersonCard } from './person-card'

/**
 * 사람 목록. 얼굴 군집은 사진 한 장짜리로 잘게 쪼개지기 쉬워서, 하나씩 상세로 들어가
 * 합치는 대신 **여기서 여러 개를 골라 한 번에** 합칠 수 있어야 한다. 합쳐질 사람은
 * 고른 것 중 사진이 가장 많은 쪽(동률이면 이름이 있는 쪽)이고, 그 이름이 남는다.
 */
export function PersonGrid({
  people,
  canManage = false,
}: {
  people: PersonSummary[]
  canManage?: boolean
}) {
  const t = useTranslations('misc')
  const router = useRouter()
  const toast = useToast()
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [merging, setMerging] = useState(false)
  // 페이지 래퍼(.section-enter)가 transform 을 남겨 fixed 의 기준이 돼 버린다(§17#19) —
  // 그대로 두면 합치기 바가 화면 아래로 밀린다. body 로 포털해서 화면에 고정한다.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const target = useMemo(() => {
    const chosen = people.filter((p) => selected.includes(p.id))
    return (
      [...chosen].sort(
        (a, b) =>
          b.photoCount - a.photoCount ||
          Number(Boolean(b.name)) - Number(Boolean(a.name)) ||
          a.id.localeCompare(b.id),
      )[0] ?? null
    )
  }, [people, selected])

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function stop() {
    setPicking(false)
    setSelected([])
  }

  async function merge() {
    if (!target || selected.length < 2) return
    setMerging(true)
    try {
      const res = await fetch('/api/people/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, sourceIds: selected }),
      })
      if (!res.ok) throw new Error('failed')
      const d = (await res.json()) as { merged: number }
      toast({ title: t('people.mergedMany', { count: d.merged }) })
      stop()
      router.refresh()
    } catch {
      toast({ title: t('people.mergeFailed'), variant: 'danger' })
    } finally {
      setMerging(false)
    }
  }

  return (
    <>
      {canManage && people.length > 1 && (
        <div className="mb-3 flex items-center justify-end">
          {picking ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-sm font-medium text-base-700 active:bg-base-200 dark:bg-base-800 dark:text-base-200"
            >
              <X size={14} />
              {t('people.pickCancel')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-base-100 px-3 py-1.5 text-sm font-medium text-base-700 active:bg-base-200 dark:bg-base-800 dark:text-base-200"
            >
              <Users size={14} />
              {t('people.pickToMerge')}
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
        {people.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            selectable={picking}
            selected={selected.includes(p.id)}
            onToggle={toggle}
          />
        ))}
      </div>
      {mounted &&
        picking &&
        selected.length > 0 &&
        createPortal(
          <div className="pointer-events-auto fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-full bg-base-900/95 px-4 py-2.5 text-white shadow-elevated backdrop-blur dark:bg-base-50/95 dark:text-base-900">
            <span className="min-w-0 flex-1 truncate text-sm">
              {selected.length < 2
                ? t('people.pickMore')
                : t('people.mergeInto', { name: target?.name ?? t('people.unnamed') })}
            </span>
            <button
              type="button"
              onClick={() => void merge()}
              disabled={selected.length < 2 || merging}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-point-500 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Check size={14} />
              {merging ? t('people.merging') : t('people.mergeConfirm')}
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
