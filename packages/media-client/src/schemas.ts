import { z } from 'zod'

export const VERSION = 1 as const

// ─── Init ────────────────────────────────────────────────────────
export const initAssetRequest = z.object({
  familyId: z.string().uuid(),
  uploaderId: z.string().uuid(),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  originalName: z.string().min(1),
  takenAt: z.string().datetime().optional(),
  clientBlurhash: z.string().min(6).max(128).optional(),
  clientAspectRatio: z.number().positive().optional(),
  clientWidth: z.number().int().positive().optional(),
  clientHeight: z.number().int().positive().optional(),
  convertToCompatible: z.boolean().optional().default(false),
})
export type InitAssetRequest = z.input<typeof initAssetRequest>

export const initAssetResponse = z.object({
  v: z.literal(VERSION),
  assetId: z.string().uuid(),
  tusUploadUrl: z.string().url(),
  uploadToken: z.string().min(1),
  expiresAt: z.string().datetime(),
})
export type InitAssetResponse = z.infer<typeof initAssetResponse>

// ─── Derivative URL set ──────────────────────────────────────────
export const derivativeTrio = z.object({
  avif: z.string().url(),
  webp: z.string().url(),
  jpeg: z.string().url(),
})
export type DerivativeTrio = z.infer<typeof derivativeTrio>

export const assetUrls = z.object({
  blurhash: z.string().nullable(),
  dominantColor: z.string().nullable(),
  aspectRatio: z.number().nullable(),
  thumb256: derivativeTrio.nullable(),
  thumb512: derivativeTrio.nullable(),
  display1080: derivativeTrio.nullable(),
  original: z.string().url().nullable(),
  videoPoster: z.string().url().nullable(),
  videoCompat: z.string().url().nullable(),
  expiresAt: z.string().datetime(),
})
export type AssetUrls = z.infer<typeof assetUrls>

export const getAssetUrlsResponse = z.object({
  v: z.literal(VERSION),
  urls: assetUrls,
})
export type GetAssetUrlsResponse = z.infer<typeof getAssetUrlsResponse>

// ─── Batch URLs ──────────────────────────────────────────────────
export const batchUrlsRequest = z.object({
  familyId: z.string().uuid(),
  assetIds: z.array(z.string().uuid()).max(200),
})
export type BatchUrlsRequest = z.infer<typeof batchUrlsRequest>

export const batchUrlsResponse = z.object({
  v: z.literal(VERSION),
  urls: z.record(z.string().uuid(), assetUrls),
})
export type BatchUrlsResponse = z.infer<typeof batchUrlsResponse>

// ─── Baby tagging ────────────────────────────────────────────────
export const setBabyTagsRequest = z.object({
  familyId: z.string().uuid(),
  babyIds: z.array(z.string().uuid()),
})
export type SetBabyTagsRequest = z.infer<typeof setBabyTagsRequest>

// ─── Errors ──────────────────────────────────────────────────────
export const mediaErrorCodes = [
  'UNAUTHORIZED',
  'UPLOAD_TOKEN_EXPIRED',
  'UPLOAD_TOKEN_INVALID',
  'ASSET_NOT_FOUND',
  'FAMILY_MISMATCH',
  'MIME_UNSUPPORTED',
  'SIZE_LIMIT_EXCEEDED',
  'PROCESSING_FAILED',
  'RATE_LIMITED',
  'INTERNAL',
] as const
export type MediaErrorCode = (typeof mediaErrorCodes)[number]

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retriable: z.boolean(),
    details: z.record(z.unknown()).optional(),
  }),
})
export type ErrorResponse = z.infer<typeof errorResponse>

// ─── Health ──────────────────────────────────────────────────────
export const healthResponse = z.object({
  v: z.literal(VERSION),
  version: z.string(),
  minWebVersion: z.string(),
  ready: z.boolean(),
})
export type HealthResponse = z.infer<typeof healthResponse>
