'use client'
import { useToast } from '@/lib/toast'
import { Calendar, FileText, Pencil, Type } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type KeyboardEvent, useState } from 'react'

type Props = {
  assetId: string
  initialFilename: string
  initialCaption: string | null
  initialTakenAtISO: string
  initialTakenAtSource: string
}

type Field = 'filename' | 'caption' | 'takenAt'

/**
 * Inline editor for the three user-mutable asset fields. Click a row to
 * turn it into an input; save on blur / Enter (Cmd+Enter for caption to
 * support multi-line). Cancel on Esc. Optimistic update via router.refresh
 * once the server commits.
 *
 * Sits ABOVE MetadataSection — that section keeps the read-only EXIF
 * fields (camera, GPS, dimensions) which can't be user-edited.
 */
export function MetadataEditor({
  assetId,
  initialFilename,
  initialCaption,
  initialTakenAtISO,
  initialTakenAtSource,
}: Props) {
  const router = useRouter()
  const toast = useToast()

  const [filename, setFilename] = useState(initialFilename)
  const [caption, setCaption] = useState(initialCaption ?? '')
  const [takenAt, setTakenAt] = useState(initialTakenAtISO)
  const [takenAtSource, setTakenAtSource] = useState(initialTakenAtSource)
  const [editing, setEditing] = useState<Field | null>(null)
  const [pending, setPending] = useState(false)

  const save = async (field: Field, value: string | null) => {
    setPending(true)
    try {
      const body =
        field === 'filename'
          ? { filename: value }
          : field === 'caption'
            ? { caption: value === '' ? null : value }
            : { takenAt: value }
      const res = await fetch(`/api/asset/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '저장 실패')
      }
      const next = (await res.json()) as {
        filename: string
        caption: string | null
        takenAt: string
        takenAtSource: string
      }
      setFilename(next.filename)
      setCaption(next.caption ?? '')
      setTakenAt(next.takenAt)
      setTakenAtSource(next.takenAtSource)
      setEditing(null)
      // Refresh server component so timeline buckets / detail page see it.
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setPending(false)
    }
  }

  const cancel = () => setEditing(null)

  return (
    <div className="rounded-2xl bg-base-50/50 px-4 py-1 dark:bg-base-950/40">
      <Row icon={<Type size={15} strokeWidth={1.9} />}>
        {editing === 'filename' ? (
          <SingleLineEditor
            initial={filename}
            onSave={(v) => save('filename', v)}
            onCancel={cancel}
            disabled={pending}
            placeholder="파일명"
          />
        ) : (
          <ClickRow label={filename} secondary="파일명" onEdit={() => setEditing('filename')} />
        )}
      </Row>

      <Row icon={<FileText size={15} strokeWidth={1.9} />}>
        {editing === 'caption' ? (
          <MultiLineEditor
            initial={caption}
            onSave={(v) => save('caption', v)}
            onCancel={cancel}
            disabled={pending}
            placeholder="설명을 적어주세요"
          />
        ) : (
          <ClickRow
            label={caption || '설명 추가'}
            secondary="설명"
            muted={!caption}
            onEdit={() => setEditing('caption')}
          />
        )}
      </Row>

      <Row icon={<Calendar size={15} strokeWidth={1.9} />} last>
        {editing === 'takenAt' ? (
          <DateTimeEditor
            initialISO={takenAt}
            onSave={(v) => save('takenAt', v)}
            onCancel={cancel}
            disabled={pending}
          />
        ) : (
          <ClickRow
            label={new Date(takenAt).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
            secondary={`촬영일${takenAtSource !== 'exif' ? ` (${takenAtSource})` : ''}`}
            onEdit={() => setEditing('takenAt')}
          />
        )}
      </Row>
    </div>
  )
}

function Row({
  icon,
  children,
  last,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={`flex items-start gap-3 py-2.5 ${
        last ? '' : 'border-b border-base-100 dark:border-base-800/60'
      }`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-base-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ClickRow({
  label,
  secondary,
  muted,
  onEdit,
}: {
  label: string
  secondary: string
  muted?: boolean
  onEdit: () => void
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex w-full items-start justify-between gap-2 text-left"
    >
      <div className="min-w-0 flex-1">
        <div
          className={`whitespace-pre-wrap break-words text-[14px] ${
            muted ? 'text-base-400' : 'text-base-900 dark:text-base-100'
          }`}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[12px] text-base-500">{secondary}</div>
      </div>
      <Pencil
        size={13}
        className="mt-1 shrink-0 text-base-300 opacity-0 transition-opacity group-hover:opacity-100"
        strokeWidth={2}
      />
    </button>
  )
}

function SingleLineEditor({
  initial,
  onSave,
  onCancel,
  disabled,
  placeholder,
}: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
  disabled: boolean
  placeholder?: string
}) {
  const [v, setV] = useState(initial)
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (v.trim()) onSave(v.trim())
    } else if (e.key === 'Escape') onCancel()
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: edit triggered by user intent
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() && v.trim() !== initial) onSave(v.trim())
        else onCancel()
      }}
      onKeyDown={onKey}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg border border-base-200 bg-base-0 px-2.5 py-1.5 text-[14px] outline-none focus:border-point-500 dark:border-base-800 dark:bg-base-900"
    />
  )
}

function MultiLineEditor({
  initial,
  onSave,
  onCancel,
  disabled,
  placeholder,
}: {
  initial: string
  onSave: (v: string) => void
  onCancel: () => void
  disabled: boolean
  placeholder?: string
}) {
  const [v, setV] = useState(initial)
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSave(v)
    } else if (e.key === 'Escape') onCancel()
  }
  return (
    <textarea
      // biome-ignore lint/a11y/noAutofocus: edit triggered by user intent
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== initial) onSave(v)
        else onCancel()
      }}
      onKeyDown={onKey}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      className="w-full resize-none rounded-lg border border-base-200 bg-base-0 px-2.5 py-1.5 text-[14px] outline-none focus:border-point-500 dark:border-base-800 dark:bg-base-900"
    />
  )
}

function DateTimeEditor({
  initialISO,
  onSave,
  onCancel,
  disabled,
}: {
  initialISO: string
  onSave: (iso: string) => void
  onCancel: () => void
  disabled: boolean
}) {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" without zone.
  const local = toLocalInputValue(initialISO)
  const [v, setV] = useState(local)

  const commit = () => {
    if (!v) {
      onCancel()
      return
    }
    const next = new Date(v).toISOString()
    if (next === initialISO) onCancel()
    else onSave(next)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    else if (e.key === 'Escape') onCancel()
  }
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: edit triggered by user intent
      autoFocus
      type="datetime-local"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      disabled={disabled}
      className="w-full rounded-lg border border-base-200 bg-base-0 px-2.5 py-1.5 text-[14px] tabular-nums outline-none focus:border-point-500 dark:border-base-800 dark:bg-base-900"
    />
  )
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
