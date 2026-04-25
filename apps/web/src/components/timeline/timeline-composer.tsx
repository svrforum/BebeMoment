'use client'
import { useUploadManager } from '@/components/upload/upload-manager'
import { useToast } from '@/lib/toast'
import { ChevronDown, Globe, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  userDisplayName: string
  userAvatarPath: string | null
  babyId: string | null
  /** Viewer's role — gates the "보호자만" visibility option. Family viewers
   *  can't post guardians-only entries (they can only see their own role). */
  viewerRole: 'owner' | 'guardian' | 'family'
}

type Visibility = 'family' | 'guardians'

type Attachment = {
  fileId: string
  name: string
  type: string
  previewUrl: string | null
  /** Asset id once the manager's preprocessor finishes. */
  assetId: string | null
  /** Asset reached `ready`. */
  ready: boolean
}

/**
 * SNS-style top-of-timeline post composer. One submit creates:
 *   1) journal entry (body + entryDate = today)
 *   2) attached photos as regular media uploads (visible in the timeline
 *      grid like any other upload)
 *   3) the journal entry references those uploads via JournalEntryAsset,
 *      so the entry's card shows the photos as thumbs.
 *
 * Photos go through the shared upload manager so the floating progress
 * pill picks them up too. The composer holds its own attachment list:
 * the manager wipes its queue after each batch finishes, but our list
 * already captured the asset id by then so submit still works.
 */
export function TimelineComposer({
  userDisplayName,
  userAvatarPath,
  babyId,
  viewerRole,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const { files, addFiles } = useUploadManager()

  const canPostGuardian = viewerRole === 'owner' || viewerRole === 'guardian'

  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('family')
  const [visMenuOpen, setVisMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync asset-id + ready state from the upload manager into our own
  // attachment objects. Keeps progress info alive after the manager
  // cancelAlls its queue once a batch is fully processed.
  useEffect(() => {
    if (attachments.length === 0) return
    const byFileId = new Map(files.map((f) => [f.id, f]))
    setAttachments((prev) => {
      let changed = false
      const next = prev.map((a) => {
        const f = byFileId.get(a.fileId)
        if (!f) return a
        const newAssetId = (f.meta?.assetId as string | undefined) ?? a.assetId
        if (newAssetId !== a.assetId) {
          changed = true
          return { ...a, assetId: newAssetId }
        }
        return a
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // Cleanup object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list) return
      const picked = Array.from(list)
      e.target.value = ''
      const ids = await addFiles(picked)
      const fresh: Attachment[] = []
      for (let i = 0; i < ids.length; i++) {
        const fileId = ids[i]
        const file = picked[i]
        if (!fileId || !file) continue
        const isImage = file.type.startsWith('image/')
        fresh.push({
          fileId,
          name: file.name,
          type: file.type,
          previewUrl: isImage ? URL.createObjectURL(file) : null,
          assetId: null,
          ready: false,
        })
      }
      if (fresh.length > 0) {
        setAttachments((prev) => [...prev, ...fresh])
        setExpanded(true)
      }
    },
    [addFiles],
  )

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.fileId === fileId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.fileId !== fileId)
    })
  }, [])

  const reset = useCallback(() => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      return []
    })
    setBody('')
    setExpanded(false)
  }, [])

  const allHaveAssetIds = useMemo(
    () => attachments.length === 0 || attachments.every((a) => !!a.assetId),
    [attachments],
  )

  const submit = useCallback(async () => {
    const trimmed = body.trim()
    if (!trimmed && attachments.length === 0) return
    if (submitting) return
    setSubmitting(true)
    try {
      // Wait up to 30s for any still-resolving asset ids (preprocessor).
      // Most photos resolve in ~1s on a fast LAN.
      const deadline = Date.now() + 30_000
      while (
        Date.now() < deadline &&
        attachments.some((a) => !a.assetId)
      ) {
        await new Promise((r) => setTimeout(r, 200))
      }

      const finalAssetIds = attachments
        .map((a) => a.assetId)
        .filter((id): id is string => typeof id === 'string')

      if (finalAssetIds.length !== attachments.length) {
        throw new Error('사진 업로드 준비가 끝나지 않았어요. 잠시 후 다시 시도해주세요.')
      }

      const today = new Date().toISOString().slice(0, 10)
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          babyId,
          entryDate: today,
          body: trimmed || ' ',
          ...(visibility !== 'family' ? { visibility } : {}),
          ...(finalAssetIds.length > 0 ? { assetIds: finalAssetIds } : {}),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? '글 등록 실패')
      }
      reset()
      router.refresh()
    } catch (e) {
      toast({ title: (e as Error).message, variant: 'danger' })
    } finally {
      setSubmitting(false)
    }
  }, [body, attachments, babyId, visibility, reset, router, toast, submitting])

  const initial = userDisplayName.charAt(0)

  return (
    <div className="rounded-3xl border border-base-200/70 bg-base-0 p-4 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <div className="flex items-start gap-3">
        <Avatar avatarPath={userAvatarPath} initial={initial} />
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="오늘 어떤 이야기가 있었어요?"
            rows={expanded ? 3 : 1}
            maxLength={20000}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-base-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape') {
                reset()
              }
            }}
          />
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 pl-13">
          {attachments.map((a) => (
            <div
              key={a.fileId}
              className="group relative h-20 w-20 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-base-500">
                  {a.type.startsWith('video/') ? 'VIDEO' : 'FILE'}
                </div>
              )}
              {!a.assetId && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                </div>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(a.fileId)}
                aria-label="제거"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X size={12} strokeWidth={2.6} />
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-3 flex items-center justify-between border-t border-base-100 pt-3 dark:border-base-800/60">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="사진 첨부"
              className="flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 hover:text-point-500 dark:hover:bg-base-800"
            >
              <ImagePlus size={18} strokeWidth={2} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onPick}
              className="hidden"
            />
            {canPostGuardian && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setVisMenuOpen((v) => !v)}
                  className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-base-600 transition-colors hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
                  aria-label="공개 범위"
                  aria-expanded={visMenuOpen}
                >
                  {visibility === 'family' ? (
                    <Globe size={13} strokeWidth={2.2} />
                  ) : (
                    <ShieldCheck size={13} strokeWidth={2.2} className="text-point-500" />
                  )}
                  <span>{visibility === 'family' ? '전체 공개' : '보호자만'}</span>
                  <ChevronDown size={12} strokeWidth={2.2} />
                </button>
                {visMenuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="닫기"
                      onClick={() => setVisMenuOpen(false)}
                      className="fixed inset-0 z-30 cursor-default bg-transparent"
                    />
                    <div className="absolute left-0 bottom-full z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-elevated dark:border-base-800/70 dark:bg-base-900">
                      <VisibilityOption
                        active={visibility === 'family'}
                        icon={<Globe size={14} strokeWidth={2.2} />}
                        title="전체 공개"
                        subtitle="가족 모두가 볼 수 있어요"
                        onClick={() => {
                          setVisibility('family')
                          setVisMenuOpen(false)
                        }}
                      />
                      <VisibilityOption
                        active={visibility === 'guardians'}
                        icon={
                          <ShieldCheck
                            size={14}
                            strokeWidth={2.2}
                            className="text-point-500"
                          />
                        }
                        title="보호자만"
                        subtitle="owner / guardian 역할에게만 보여요"
                        onClick={() => {
                          setVisibility('guardians')
                          setVisMenuOpen(false)
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            {!allHaveAssetIds && (
              <span className="ml-1 text-[12px] text-base-500">사진 준비 중…</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(body.length > 0 || attachments.length > 0) && (
              <button
                type="button"
                onClick={reset}
                className="rounded-full px-3 py-1.5 text-[13px] font-medium text-base-500 hover:bg-base-100 dark:hover:bg-base-800"
              >
                취소
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={
                submitting ||
                (body.trim().length === 0 && attachments.length === 0)
              }
              className="rounded-full bg-point-500 px-4 py-1.5 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600 disabled:opacity-50"
            >
              {submitting ? '올리는 중…' : '올리기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function VisibilityOption({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-base-100 dark:hover:bg-base-800 ${
        active ? 'bg-point-500/8 dark:bg-point-500/10' : ''
      }`}
    >
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-base-500">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-base-900 dark:text-base-50">
          {title}
        </div>
        <div className="mt-0.5 text-[11px] text-base-500">{subtitle}</div>
      </div>
    </button>
  )
}

function Avatar({
  avatarPath,
  initial,
}: {
  avatarPath: string | null
  initial: string
}) {
  if (avatarPath) {
    return (
      <img
        src={avatarPath}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[14px] font-semibold text-point-500">
      {initial}
    </div>
  )
}
