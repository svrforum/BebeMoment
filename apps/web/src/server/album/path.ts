/**
 * Materialized-path helpers for the album tree.
 *
 * Path format: slash-separated album uuids ending with this album's id.
 *   root album        → "<id>"
 *   "2026 / 여행"     → "<2026Id>/<여행Id>"
 *
 * Invariants maintained at write time (not by DB triggers — see CLAUDE.md
 * §17 on keeping migrations Synology-friendly):
 * - depth === path.split('/').length - 1
 * - The last segment of path === own id
 * - Every non-last segment === a parent uuid in the same family chain
 */

export const MAX_DEPTH = 4 // root + 4 nested levels

export function computePath(parentPath: string | null, ownId: string): string {
  return parentPath ? `${parentPath}/${ownId}` : ownId
}

export function depthFromPath(path: string): number {
  return path.split('/').length - 1
}

/** Replace one prefix of `path` with another. Used when moving subtrees. */
export function rewritePathPrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix
  if (path.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}/${path.slice(oldPrefix.length + 1)}`
  }
  return path
}

/** True if `candidate` is `ancestor` itself or sits under it. */
export function isDescendant(candidatePath: string, ancestorPath: string): boolean {
  return candidatePath === ancestorPath || candidatePath.startsWith(`${ancestorPath}/`)
}

/** Parent uuid (penultimate segment) or null for root albums. */
export function parentIdFromPath(path: string): string | null {
  const parts = path.split('/')
  if (parts.length < 2) return null
  return parts[parts.length - 2] ?? null
}
