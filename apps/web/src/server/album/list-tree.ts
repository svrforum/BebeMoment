import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import { unstable_cache } from 'next/cache'

export type AlbumTreeNode = {
  id: string
  name: string
  parentId: string | null
  depth: number
  path: string
  secret: boolean
  children: AlbumTreeNode[]
  childCount: number
}

/** family 역할에겐 비밀 노드(와 그 하위)를 통째로 제거. */
function pruneSecret(nodes: AlbumTreeNode[]): AlbumTreeNode[] {
  return nodes
    .filter((n) => !n.secret)
    .map((n) => {
      const children = pruneSecret(n.children)
      return { ...n, children, childCount: children.length }
    })
}

/**
 * Build the entire album tree for one family. Cached per family for 60s
 * with tag `albums:${familyId}` — the album picker reads this on every
 * detail-page open. The cached tree is the *full* tree; secret nodes are
 * pruned per `viewerRole` after the cache (so the cache stays role-agnostic).
 */
export async function listAlbumTree(
  familyId: string,
  viewerRole: Role,
  prismaPublic: PrismaPublic,
): Promise<AlbumTreeNode[]> {
  const tree = await unstable_cache(
    () => listAlbumTreeRaw(familyId, prismaPublic),
    ['album-tree', familyId],
    { revalidate: 60, tags: [`albums:${familyId}`] },
  )()
  return viewerRole === 'family' ? pruneSecret(tree) : tree
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
      secret: true,
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
