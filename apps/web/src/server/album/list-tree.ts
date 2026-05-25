import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { unstable_cache } from 'next/cache'

export type AlbumTreeNode = {
  id: string
  name: string
  parentId: string | null
  depth: number
  path: string
  children: AlbumTreeNode[]
  childCount: number
}

/**
 * Build the entire album tree for one family. Cached per family for 60s
 * with tag `albums:${familyId}` — the album picker reads this on every
 * detail-page open. Mutations (create / move / rename / delete album,
 * asset attach / detach) call `revalidateTag('albums:${familyId}')` to
 * pop the cache.
 */
export function listAlbumTree(
  familyId: string,
  prismaPublic: PrismaPublic,
): Promise<AlbumTreeNode[]> {
  return unstable_cache(() => listAlbumTreeRaw(familyId, prismaPublic), ['album-tree', familyId], {
    revalidate: 60,
    tags: [`albums:${familyId}`],
  })()
}

async function listAlbumTreeRaw(
  familyId: string,
  prismaPublic: PrismaPublic,
): Promise<AlbumTreeNode[]> {
  const albums = await prismaPublic.album.findMany({
    where: { familyId, deletedAt: null },
    orderBy: [{ depth: 'asc' }, { sortIndex: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      parentId: true,
      depth: true,
      path: true,
    },
  })

  const nodeById = new Map<string, AlbumTreeNode>()
  for (const a of albums) {
    nodeById.set(a.id, { ...a, children: [], childCount: 0 })
  }

  // Children whose parent is soft-deleted would otherwise float up to the
  // root forest. Drop them — the family rule is "see live albums only".
  const roots: AlbumTreeNode[] = []
  for (const node of nodeById.values()) {
    if (node.parentId) {
      if (nodeById.has(node.parentId)) {
        const parent = nodeById.get(node.parentId)
        if (parent) {
          parent.children.push(node)
          parent.childCount++
        }
      }
      // Else: orphaned (parent deleted) — skip. retention will hard-delete.
    } else {
      roots.push(node)
    }
  }
  return roots
}
