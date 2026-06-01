import type { AssetWithUrls } from '@/server/asset/types'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

export type FaceBox = { x: number; y: number; w: number; h: number }

export type PersonCover = { assetId: string; urls: AssetUrls | null; bbox: FaceBox }

export type PersonSummary = {
  id: string
  name: string | null
  faceCount: number
  cover: PersonCover | null
}

/**
 * 가족의 사람(군집) 목록 — 얼굴 수 많은 순. 각 사람의 대표 얼굴(coverFaceId)을 thumb URL +
 * bbox 와 함께 돌려준다(UI 가 bbox 중심으로 CSS 크롭). 대표 얼굴의 자산이 삭제/미준비면
 * cover=null. 얼굴 0개인 사람(전부 다른 자산으로 이동·삭제)은 제외.
 */
export async function listPeople(
  args: { familyId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PersonSummary[]> {
  const { familyId } = args
  const persons = await prismaMedia.person.findMany({
    where: { familyId, faceCount: { gt: 0 } },
    orderBy: [{ faceCount: 'desc' }, { createdAt: 'asc' }],
  })
  if (persons.length === 0) return []

  const coverIds = persons.map((p) => p.coverFaceId).filter((x): x is string => x !== null)
  const coverFaces = coverIds.length
    ? await prismaMedia.face.findMany({
        where: { id: { in: coverIds }, familyId },
        select: { id: true, assetId: true, bboxX: true, bboxY: true, bboxW: true, bboxH: true },
      })
    : []
  const faceById = new Map(coverFaces.map((f) => [f.id, f]))

  const coverAssetIds = Array.from(new Set(coverFaces.map((f) => f.assetId)))
  const readyAssets = coverAssetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: coverAssetIds }, familyId, status: 'ready', deletedAt: null },
        select: { id: true },
      })
    : []
  const readySet = new Set(readyAssets.map((a) => a.id))

  const urlAssetIds = coverAssetIds.filter((id) => readySet.has(id))
  const urls = urlAssetIds.length ? await media.getAssetUrlsBatch(familyId, urlAssetIds) : {}

  return persons.map((p) => {
    const f = p.coverFaceId ? faceById.get(p.coverFaceId) : undefined
    const cover: PersonCover | null =
      f && readySet.has(f.assetId)
        ? {
            assetId: f.assetId,
            urls: urls[f.assetId] ?? null,
            bbox: { x: f.bboxX, y: f.bboxY, w: f.bboxW, h: f.bboxH },
          }
        : null
    return { id: p.id, name: p.name, faceCount: p.faceCount, cover }
  })
}

export type PersonDetail = {
  person: { id: string; name: string | null; faceCount: number } | null
  assets: AssetWithUrls[]
}

/** 한 사람의 사진(타임라인 포맷, 촬영일 내림차순). 같은 자산에 여러 얼굴이 있어도 1번만. */
export async function getPersonAssets(
  args: { familyId: string; personId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PersonDetail> {
  const { familyId, personId } = args
  const person = await prismaMedia.person.findFirst({
    where: { id: personId, familyId },
    select: { id: true, name: true, faceCount: true },
  })
  if (!person) return { person: null, assets: [] }

  const faces = await prismaMedia.face.findMany({
    where: { familyId, personId },
    select: { assetId: true },
  })
  const assetIds = Array.from(new Set(faces.map((f) => f.assetId)))
  if (assetIds.length === 0) return { person, assets: [] }

  const assets = await prismaMedia.asset.findMany({
    where: {
      id: { in: assetIds },
      familyId,
      status: 'ready',
      deletedAt: null,
      duplicateOf: null,
    },
    orderBy: { takenAt: 'desc' },
  })
  const urls = assets.length
    ? await media.getAssetUrlsBatch(
        familyId,
        assets.map((a) => a.id),
      )
    : {}
  return {
    person,
    assets: assets.map((a) => ({ ...a, urls: urls[a.id] ?? null })),
  }
}

/** 사람 이름 변경(빈 문자열 → null = "이름 없음"). family 스코프 강제. */
export async function renamePerson(
  args: { familyId: string; personId: string; name: string | null },
  prismaMedia: PrismaMedia,
): Promise<void> {
  const trimmed = args.name?.trim() ?? ''
  await prismaMedia.person.updateMany({
    where: { id: args.personId, familyId: args.familyId },
    data: { name: trimmed === '' ? null : trimmed },
  })
}
