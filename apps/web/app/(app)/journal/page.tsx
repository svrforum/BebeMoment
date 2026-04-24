import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listJournalEntries } from '@/server/journal/list'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function JournalPage() {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')

  const { items } = await listJournalEntries(
    ctx.family.id,
    { limit: 50 },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )

  return (
    <>
      <AppHeader title="일기" />
      <div className="mx-auto max-w-md space-y-3 px-5 py-4">
        <Button asChild className="w-full">
          <Link href="/journal/new">일기 쓰기</Link>
        </Button>
        {items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">첫 일기를 써보세요.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((e) => (
              <li key={e.id}>
                <Link href={`/journal/${e.id}`}>
                  <Card>
                    <CardBody>
                      <div className="text-xs text-muted-foreground">
                        {e.entryDate.toISOString().slice(0, 10)}
                      </div>
                      {e.title && <div className="mt-1 font-medium">{e.title}</div>}
                      <div className="line-clamp-2 text-sm text-muted-foreground">{e.body}</div>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
