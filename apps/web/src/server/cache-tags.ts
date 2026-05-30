/**
 * Wrappers around `revalidateTag` so cache invalidation is one call from
 * a mutation. `revalidateTag` is only valid in a request scope (route
 * handlers / server actions); during unit tests there's no request, and
 * the symbol throws. We swallow that here so service-layer tests don't
 * have to mock next/cache.
 */
import { revalidateTag } from 'next/cache'

export function revalidateAlbumsTag(familyId: string): void {
  try {
    revalidateTag(`albums:${familyId}`, 'max')
  } catch {
    // outside request scope
  }
}
