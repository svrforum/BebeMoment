/**
 * Wrappers around `revalidateTag` so cache invalidation is one call from
 * a mutation. `revalidateTag` is only valid in a request scope (route
 * handlers / server actions); during unit tests there's no request, and
 * the symbol throws. We swallow that here so service-layer tests don't
 * have to mock next/cache.
 */
import { revalidateTag } from 'next/cache'

export function revalidateTagsTag(familyId: string): void {
  try {
    revalidateTag(`tags:${familyId}`)
  } catch {
    // outside request scope (tests); cache helpers are no-ops there
  }
}

export function revalidateAlbumsTag(familyId: string): void {
  try {
    revalidateTag(`albums:${familyId}`)
  } catch {
    // outside request scope
  }
}
