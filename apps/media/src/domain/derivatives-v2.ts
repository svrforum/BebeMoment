import { z } from 'zod'

const trio = z.object({
  avif: z.string().min(1),
  webp: z.string().min(1),
  jpeg: z.string().min(1),
})

export const derivativesV2Schema = z.object({
  v: z.literal(2),
  thumb256: trio,
  thumb512: trio,
  display1080: trio,
  videoPoster: z.string().min(1).optional(),
  videoCompat: z.string().min(1).optional(),
})

export type DerivativesV2 = z.infer<typeof derivativesV2Schema>

export function parseDerivativesV2(input: unknown): DerivativesV2 | null {
  if (!input || typeof input !== 'object') return null
  const result = derivativesV2Schema.safeParse(input)
  return result.success ? result.data : null
}
