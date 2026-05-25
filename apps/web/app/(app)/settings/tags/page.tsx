import { AppHeader } from '@/components/shell/app-header'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { listTagsWithCounts } from '@/server/tag/list'
import { TagsManager } from './tags-manager'

export default async function TagsSettingsPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const tags = await listTagsWithCounts(ctx.family.id, prismaPublic)

  return (
    <>
      <AppHeader title="태그 관리" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        <TagsManager
          initial={tags.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            color: t.color,
            assetCount: t.assetCount,
          }))}
        />
      </div>
    </>
  )
}
