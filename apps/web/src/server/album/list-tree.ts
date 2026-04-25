import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

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
 * Build the entire album tree for one family. The result is a forest of
 * root nodes; each node has its children inlined for one-pass sidebar
 * rendering. Single SELECT — we shape the tree in memory.
 */
export async function listAlbumTree(
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
