import { z } from 'zod'

export const VERSION = 1 as const

// 파일 서빙 signed URL 은 기본이 **루트 상대 경로**(`/media/v1/files/<jwt>`) — 단일 포트
// 오리진 무관 로딩(§signed-url). 미디어를 별도 호스트로 분리하면 절대 URL 일 수도 있어
// 둘 다 허용한다.
const mediaUrl = z.string().refine((s) => s.startsWith('/') || /^https?:\/\//.test(s), {
  message: 'absolute URL 또는 루트 상대 경로(/...) 여야 합니다',
})

// 선언 파일 크기 절대 상한(5 GiB) — 토큰 maxBytes 가 임의로 커지는 걸 막아 tus 인라인
// 제한이 의미를 갖게 한다.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024

// ─── Init ────────────────────────────────────────────────────────
export const initAssetRequest = z.object({
  familyId: z.string().uuid(),
  uploaderId: z.string().uuid(),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  originalName: z.string().min(1),
  takenAt: z.string().datetime().optional(),
  // 클라가 보낸 파일 수정시각(File.lastModified). EXIF 촬영일·파일명 패턴이 없을 때의
  // 폴백으로 쓴다(takenAtSource='filemtime') — 갤러리가 보여주는 날짜와 맞춘다.
  fileModifiedAt: z.string().datetime().optional(),
  clientBlurhash: z.string().min(6).max(128).optional(),
  clientAspectRatio: z.number().positive().optional(),
  clientWidth: z.number().int().positive().optional(),
  clientHeight: z.number().int().positive().optional(),
  convertToCompatible: z.boolean().optional().default(false),
  // false 면 처리 완료 후 개별 'asset.uploaded' 푸시를 생략(스토리 첨부 사진 — 스토리
  // 푸시 하나로 갈음). 얼굴 인식 등 다른 후처리는 그대로 동작.
  notify: z.boolean().optional().default(true),
})
export type InitAssetRequest = z.input<typeof initAssetRequest>

export const initAssetResponse = z.object({
  v: z.literal(VERSION),
  assetId: z.string().uuid(),
  tusUploadUrl: mediaUrl,
  uploadToken: z.string().min(1),
  expiresAt: z.string().datetime(),
})
export type InitAssetResponse = z.infer<typeof initAssetResponse>

// ─── Derivative URL set ──────────────────────────────────────────
export const derivativeTrio = z.object({
  avif: mediaUrl,
  webp: mediaUrl,
  jpeg: mediaUrl,
})
export type DerivativeTrio = z.infer<typeof derivativeTrio>

export const assetUrls = z.object({
  blurhash: z.string().nullable(),
  dominantColor: z.string().nullable(),
  aspectRatio: z.number().nullable(),
  thumb256: derivativeTrio.nullable(),
  thumb512: derivativeTrio.nullable(),
  display1080: derivativeTrio.nullable(),
  original: mediaUrl.nullable(),
  videoPoster: mediaUrl.nullable(),
  videoCompat: mediaUrl.nullable(),
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
  // Trash view needs URLs for soft-deleted assets; default keeps them excluded.
  includeDeleted: z.boolean().optional(),
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

// ─── Metadata edit ───────────────────────────────────────────────
// Editable fields on the asset detail page. Storage object is NOT
// renamed when filename changes — it stays display-only.
// biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are deliberately rejected in filenames
const FILENAME_RE = /^[^\x00-\x1f/\\]+$/
export const updateAssetMetadataRequest = z.object({
  familyId: z.string().uuid(),
  editedByUserId: z.string().uuid(),
  filename: z.string().min(1).max(255).regex(FILENAME_RE).optional(),
  caption: z.string().max(500).nullable().optional(),
  takenAt: z.string().datetime().optional(),
})
export type UpdateAssetMetadataRequest = z.infer<typeof updateAssetMetadataRequest>

export const updateAssetMetadataResponse = z.object({
  v: z.literal(VERSION),
  filename: z.string(),
  caption: z.string().nullable(),
  takenAt: z.string().datetime(),
  takenAtSource: z.string(),
})
export type UpdateAssetMetadataResponse = z.infer<typeof updateAssetMetadataResponse>

// ─── Download mint ───────────────────────────────────────────────
export const mintDownloadRequest = z.object({
  familyId: z.string().uuid(),
  assetId: z.string().uuid(),
  quality: z.enum(['original', 'hd', 'sd']),
})
export type MintDownloadRequest = z.infer<typeof mintDownloadRequest>

export const mintDownloadResponse = z.object({
  v: z.literal(VERSION),
  url: z.string().min(1),
})
export type MintDownloadResponse = z.infer<typeof mintDownloadResponse>

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
