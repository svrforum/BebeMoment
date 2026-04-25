/**
 * Normalize a tag display name into its slug.
 * - NFC-normalize so visually-identical Korean strings collide.
 * - Lowercase ASCII (Korean is unaffected by toLowerCase).
 * - Collapse internal whitespace into a single dash.
 * - Strip leading/trailing whitespace.
 *
 * Edge cases:
 *  - Empty / whitespace-only input returns empty string — caller validates.
 *  - Slashes are allowed in slug; the unique key is per-family so they
 *    don't conflict with album path semantics.
 */
export function slugifyTag(name: string): string {
  return name.normalize('NFC').trim().toLowerCase().replace(/\s+/g, '-')
}
