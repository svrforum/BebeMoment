import { DiaryDeleteButton } from '@/components/diary/DiaryDeleteButton'
import { DiaryDetail } from '@/components/diary/DiaryDetail'
import { DiaryForm } from '@/components/diary/DiaryForm'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { getDiaryEntry } from '@/server/diary/get'
import { ChevronLeft, Pencil } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { deleteDiaryAction, updateDiaryAction } from './actions'

export default async function DiaryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) redirect('/onboarding')
  const { id } = await params
  const sp = await searchParams
  const entry = await getDiaryEntry(id, ctx.family.id, prismaPublic, prismaMedia, getMediaClient())
  if (!entry) notFound()

  if (sp.edit === '1') {
    const [babies, assets] = await Promise.all([
      prismaPublic.baby.findMany({
        where: { familyId: ctx.family.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { birthDate: 'asc' },
      }),
      prismaMedia.asset.findMany({
        where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
        orderBy: { takenAt: 'desc' },
        take: 200,
      }),
    ])
    const urlsMap = assets.length
      ? await getMediaClient().getAssetUrlsBatch(
          ctx.family.id,
          assets.map((a) => a.id),
        )
      : {}
    const pickerAssets = assets.map((a) => ({
      id: a.id,
      urls: urlsMap[a.id] ?? null,
    }))
    return (
      <>
        <header className="sticky top-0 z-30 border-b border-base-200/60 bg-base-50/80 backdrop-blur-xl dark:border-base-800/60 dark:bg-base-950/70">
          <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-3 px-5">
            <Link
              href={`/diary/${id}`}
              className="text-[15px] font-medium text-base-600 transition-colors hover:text-base-900 dark:text-base-300 dark:hover:text-base-50"
            >
              취소
            </Link>
            <span className="text-[15px] font-semibold text-base-900 dark:text-base-50">
              일기 편집
            </span>
            <span className="w-12" aria-hidden />
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-5 py-4">
          <DiaryForm
            action={updateDiaryAction.bind(null, id)}
            babies={babies}
            availableAssets={pickerAssets}
            submitLabel="저장"
            defaults={{
              babyId: entry.babyId,
              entryDate: entry.entryDate.toISOString().slice(0, 10),
              title: entry.title,
              body: entry.body,
              mood: entry.mood,
              assetIds: entry.assets.map((a) => a.assetId),
            }}
          />
        </div>
      </>
    )
  }

  return (
    <>
      <DiaryDetailHeader />
      <div className="mx-auto max-w-2xl px-5 py-4">
        <DiaryDetail entry={entry} />
        <div className="mt-3 flex items-center justify-end gap-1 text-[12px]">
          <Link
            href={`/diary/${id}?edit=1`}
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium text-base-500 transition-colors hover:bg-base-100 hover:text-base-800 active:scale-95 dark:text-base-400 dark:hover:bg-base-800 dark:hover:text-base-100"
          >
            <Pencil size={13} strokeWidth={2.2} />
            <span>편집</span>
          </Link>
          <DiaryDeleteButton onDelete={deleteDiaryAction.bind(null, id)} />
        </div>
      </div>
    </>
  )
}

function DiaryDetailHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-base-50/80 backdrop-blur-xl transition-colors dark:bg-base-950/70">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-3">
        <Link
          href="/diary"
          aria-label="뒤로"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-700 transition-colors hover:bg-base-100 active:scale-95 dark:text-base-200 dark:hover:bg-base-800"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </Link>
        <span className="flex-1 truncate text-[15px] font-semibold text-base-900 dark:text-base-50">
          일기
        </span>
      </div>
    </header>
  )
}
