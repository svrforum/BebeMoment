import { z } from 'zod'

const trio = z.object({
  avif: z.string().min(1),
  webp: z.string().min(1),
  jpeg: z.string().min(1),
})

export const derivativesV2Schema = z.object({
  v: z.literal(2),
  thumb256: trio.optional(),
  thumb512: trio.optional(),
  display1080: trio.optional(),
  videoPoster: z.string().min(1).optional(),
  videoCompat: z.string().min(1).optional(),
})

export type DerivativesV2 = z.infer<typeof derivativesV2Schema>

/**
 * Parse the asset.derivatives JSON into a v2-shaped record.
 *
 * Adapts the legacy video shape `{ poster, preview_video }` (pre-Phase-C-2,
 * before image trios were generated for videos) into a partial v2 record so
 * the timeline at least gets the poster as a thumb fallback.
 */
export function parseDerivativesV2(input: unknown): DerivativesV2 | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>

  // Legacy video derivatives — no `v` field, only poster + preview_video keys.
  // Map them onto the v2 shape so url-resolver can sign the poster.
  if (obj.v !== 2 && typeof obj.poster === 'string') {
    return {
      v: 2,
      videoPoster: obj.poster,
      ...(typeof obj.preview_video === 'string' ? { videoCompat: obj.preview_video } : {}),
    }
  }

  const result = derivativesV2Schema.safeParse(input)
  return result.success ? result.data : null
}
