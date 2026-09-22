'use client'
import { cn } from '@/lib/cn'
import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type KeyboardEvent, useRef, useState } from 'react'
import { type ChecklistDraftItem, appendChecklistItem } from './form-model'

type Props = {
  items: ChecklistDraftItem[]
  onChange: (items: ChecklistDraftItem[]) => void
}

// 준비물 목록은 열다섯 줄까지 간다 — 줄 높이는 손끝 하한(44px)에 딱 맞추고 줄 사이는 4px 만
// 둬서 한 화면에 최대한 담는다. `checklist-editor.test.ts` 가 하한을 지킨다.
const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-transparent bg-base-100 px-3 text-[15px] text-base-900 placeholder:text-base-400 transition-all focus-visible:border-point-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-point-500/15 dark:bg-base-800 dark:text-base-100'

const REMOVE_BUTTON_CLASS =
  'focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 active:scale-95 dark:hover:bg-base-800'

const ADD_BUTTON_CLASS =
  'focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-base-100 text-base-600 transition active:scale-95 dark:bg-base-800 dark:text-base-300'

export function ChecklistEditor({ items, onChange }: Props) {
  const t = useTranslations('schedule')
  const [draft, setDraft] = useState('')
  const seq = useRef(0)
  const nextKey = () => {
    seq.current += 1
    return `draft-${seq.current}`
  }

  // 입력을 비우는 것 외에 **아무것도 하지 않는다** — blur 도, 리마운트도, disabled 토글도
  // 없다. 그래야 키보드가 열린 채로 다음 항목을 이어서 넣을 수 있다. 12개짜리 준비물
  // 목록이 한 번에 들어가느냐 마느냐가 여기서 갈린다.
  const commitDraft = () => {
    const next = appendChecklistItem(items, draft, nextKey())
    if (next === items) return
    onChange(next)
    setDraft('')
  }

  const onDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    // 폼 제출(= 시트 저장)로 새지 않게. 엔터는 '다음 항목'이지 '저장'이 아니다.
    e.preventDefault()
    // 한글 조합 중의 엔터는 글자 확정이다 — 항목으로 세면 반쪽짜리 낱말이 들어간다.
    if (e.nativeEvent.isComposing) return
    commitDraft()
  }

  const renameAt = (index: number, label: string) => {
    onChange(items.map((item, i) => (i === index ? { ...item, label } : item)))
  }

  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={item.key} className="flex items-center gap-1">
              <input
                value={item.label}
                maxLength={200}
                onChange={(e) => renameAt(index, e.target.value)}
                className={cn(INPUT_CLASS, 'flex-1')}
              />
              <button
                type="button"
                aria-label={t('form.checklistRemove')}
                onClick={() => removeAt(index)}
                className={REMOVE_BUTTON_CLASS}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1">
        <input
          value={draft}
          maxLength={200}
          enterKeyHint="next"
          placeholder={t('form.checklistPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKeyDown}
          className={cn(INPUT_CLASS, 'flex-1')}
        />
        <button
          type="button"
          aria-label={t('form.checklistAdd')}
          // 마우스 다운 시점에 포커스가 입력에서 떠나면 모바일 키보드가 닫힌다.
          onMouseDown={(e) => e.preventDefault()}
          onClick={commitDraft}
          className={ADD_BUTTON_CLASS}
        >
          <Plus size={17} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
