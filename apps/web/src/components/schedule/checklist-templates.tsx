'use client'
import {
  deleteChecklistTemplateAction,
  listChecklistTemplatesAction,
  saveChecklistTemplateAction,
} from '@/(app)/schedule/actions'
import { actionErrorText } from '@/lib/action-result'
import { mergeTemplateItems } from '@/lib/checklist-template-merge'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import type { ChecklistTemplateView } from '@/server/schedule/templates'
import { BookmarkPlus, ClipboardList, Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

type Panel = 'closed' | 'load' | 'save'

const TOOL_BUTTON =
  'focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-[14px] font-medium text-point-500 transition active:opacity-70 disabled:text-base-300 dark:disabled:text-base-600'

/**
 * 체크리스트 아래의 템플릿 도구. 시트 안에서 또 시트를 열면 모바일에서 겹침·키보드가 깨지기
 * 쉬워서, 같은 자리에 펼쳐지는 패널로 둔다. 불러오기는 덧붙이기만 한다(이미 있는 항목은 건너뜀).
 */
export function ChecklistTemplates({
  labels,
  defaultName,
  onAppend,
}: {
  labels: string[]
  defaultName: string
  onAppend: (labels: string[]) => void
}) {
  const t = useTranslations('schedule')
  const tRoot = useTranslations()
  const toast = useToast()
  const [panel, setPanel] = useState<Panel>('closed')
  const [templates, setTemplates] = useState<ChecklistTemplateView[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 편집기는 스크롤되는 시트 본문 아래쪽에 있고 저장 버튼이 그 밑을 덮고 있다 — 펼친 패널이
  // 화면 밖에 열리면 눌러도 아무 일이 없는 것처럼 보인다. 열리거나 목록이 도착하면 보이게 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loading 은 본문에서 안 쓰지만, 목록이 도착해 패널 높이가 바뀔 때 다시 맞추려고 넣는다
  useEffect(() => {
    if (panel === 'closed') return
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [panel, loading])

  const fail = (r: Parameters<typeof actionErrorText>[1]) =>
    toast({ title: actionErrorText(tRoot, r), variant: 'danger' })

  const openLoad = async () => {
    if (panel === 'load') return setPanel('closed')
    setPanel('load')
    setConfirmDelete(null)
    setLoading(true)
    const r = await listChecklistTemplatesAction()
    setLoading(false)
    if (!r.ok) {
      setPanel('closed')
      return fail(r)
    }
    setTemplates(r.data)
  }

  const openSave = () => {
    if (panel === 'save') return setPanel('closed')
    setName(defaultName.trim().slice(0, 40))
    setPanel('save')
  }

  const apply = (tpl: ChecklistTemplateView) => {
    const added = mergeTemplateItems(labels, tpl.items)
    if (added.length > 0) onAppend(added)
    toast({
      title:
        added.length > 0 ? t('template.applied', { n: added.length }) : t('template.nothingNew'),
    })
    setPanel('closed')
  }

  const remove = async (tpl: ChecklistTemplateView) => {
    if (confirmDelete !== tpl.id) return setConfirmDelete(tpl.id)
    const r = await deleteChecklistTemplateAction(tpl.id)
    if (!r.ok) return fail(r)
    setTemplates((cur) => cur?.filter((x) => x.id !== tpl.id) ?? null)
    setConfirmDelete(null)
  }

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    const r = await saveChecklistTemplateAction({ name, items: labels })
    setSaving(false)
    if (!r.ok) return fail(r)
    toast({
      title: r.data.replaced
        ? t('template.replaced', { name: r.data.template.name })
        : t('template.saved', { name: r.data.template.name }),
      variant: 'success',
    })
    setTemplates(null)
    setPanel('closed')
  }

  return (
    <div ref={panelRef} className="mt-1 scroll-mb-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openLoad}
          aria-expanded={panel === 'load'}
          className={TOOL_BUTTON}
        >
          <ClipboardList size={16} strokeWidth={2.2} aria-hidden />
          {t('template.load')}
        </button>
        <button
          type="button"
          onClick={openSave}
          disabled={labels.length === 0}
          aria-expanded={panel === 'save'}
          className={TOOL_BUTTON}
        >
          <BookmarkPlus size={16} strokeWidth={2.2} aria-hidden />
          {t('template.save')}
        </button>
      </div>

      {panel === 'load' && (
        <div className="mt-1 rounded-2xl border border-base-200/70 bg-base-50 p-1.5 dark:border-base-800/70 dark:bg-base-800/40">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-4 text-[14px] text-base-400">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              {t('template.loading')}
            </p>
          ) : templates && templates.length > 0 ? (
            <ul className="space-y-1">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => apply(tpl)}
                    className="focus-ring min-h-11 min-w-0 flex-1 rounded-xl bg-base-0 px-3 py-2 text-left transition active:scale-[0.99] dark:bg-base-900"
                  >
                    <span className="block truncate text-[15px] font-medium text-base-900 dark:text-base-50">
                      {tpl.name}
                    </span>
                    <span className="block truncate text-[12px] text-base-500 dark:text-base-400">
                      {t('template.itemCount', { n: tpl.items.length })} · {tpl.items.join(', ')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(tpl)}
                    aria-label={t('template.delete')}
                    className={cn(
                      'focus-ring flex h-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold transition active:scale-95',
                      confirmDelete === tpl.id
                        ? 'bg-danger/10 px-3 text-danger'
                        : 'w-11 text-base-400',
                    )}
                  >
                    {confirmDelete === tpl.id ? (
                      t('template.deleteConfirm')
                    ) : (
                      <Trash2 size={16} strokeWidth={2.2} aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-center text-[13px] leading-relaxed text-base-500">
              {t('template.empty')}
            </p>
          )}
        </div>
      )}

      {panel === 'save' && (
        <div className="mt-1 flex items-center gap-1.5 rounded-2xl border border-base-200/70 bg-base-50 p-1.5 dark:border-base-800/70 dark:bg-base-800/40">
          <input
            value={name}
            maxLength={40}
            // biome-ignore lint/a11y/noAutofocus: 저장 패널을 연 목적이 이름 입력이다
            autoFocus
            enterKeyHint="done"
            placeholder={t('template.namePlaceholder')}
            aria-label={t('template.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
              e.preventDefault()
              void save()
            }}
            className="h-11 min-w-0 flex-1 rounded-xl bg-base-0 px-3 text-[15px] text-base-900 placeholder:text-base-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-point-500/40 dark:bg-base-900 dark:text-base-100"
          />
          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || saving}
            className="focus-ring flex h-11 shrink-0 items-center rounded-xl bg-point-500 px-4 text-[14px] font-semibold text-white transition active:scale-95 disabled:opacity-40"
          >
            {t('template.saveConfirm')}
          </button>
        </div>
      )}
    </div>
  )
}
