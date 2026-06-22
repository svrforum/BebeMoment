import type { Role } from '@bebe/core'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { isAlbumSecretForViewer } from '@/server/album/secret-visibility'

export type SearchInput = {
  familyId: string
  viewerRole: Role
  query: string
  /** 인물 검색은 얼굴 인식 기능이 켜졌을 때만 (features.faces). */
  facesEnabled: boolean
}

export type SearchResults = {
  query: string
  stories: {
    id: string
    publicNo: number
    title: string | null
    snippet: string
    entryDate: Date
  }[]
  milestones: { id: string; label: string; note: string | null; achievedAt: Date; babyId: string }[]
  albums: { id: string; name: string }[]
  babies: { id: string; name: string }[]
  people: { id: string; name: string }[]
  total: number
}

const PER = 10
const SNIPPET = 90

function snippetFrom(body: string, q: string): string {
  const text = body.replace(/\s+/g, ' ').trim()
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return text.slice(0, SNIPPET)
  const start = Math.max(0, at - 24)
  return (start > 0 ? '…' : '') + text.slice(start, start + SNIPPET)
}

const EMPTY = (q: string): SearchResults => ({
  query: q,
  stories: [],
  milestones: [],
  albums: [],
  babies: [],
  people: [],
  total: 0,
})

/**
 * 가족 범위 전역 검색 (Phase 1). 텍스트가 있는 엔티티를 ILIKE(`contains`, 대소문자 무시)로
 * 훑는다 — 가족 단위 데이터는 작아 인덱스 없이도 즉시 응답(대형 가족에서 느려지면 pg_trgm
 * 인덱스 추가). 테넌트(familyId)와 **비밀 가시성**을 반드시 존중: family 역할에겐 보호자 전용
 * 스토리(visibility='guardians')와 비밀 앨범(조상 포함)을 노출하지 않는다.
 */
export async function searchAll(
  input: SearchInput,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<SearchResults> {
  const q = input.query.trim()
  if (q.length === 0) return EMPTY(q)
  const { familyId, viewerRole } = input
  const like = { contains: q, mode: 'insensitive' as const }
  const familyOnly = viewerRole === 'family'

  const [storyRows, milestoneRows, albumRows, babyRows, personRows] = await Promise.all([
    prismaPublic.story.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(familyOnly ? { visibility: 'family' } : {}),
        OR: [{ title: like }, { body: like }],
      },
      select: { id: true, publicNo: true, title: true, body: true, entryDate: true },
      orderBy: { entryDate: 'desc' },
      take: PER,
    }),
    prismaPublic.milestone.findMany({
      where: {
        familyId,
        deletedAt: null,
        OR: [{ customLabel: like }, { note: like }],
      },
      select: { id: true, customLabel: true, note: true, achievedAt: true, babyId: true },
      orderBy: { achievedAt: 'desc' },
      take: PER,
    }),
    prismaPublic.album.findMany({
      where: {
        familyId,
        deletedAt: null,
        name: like,
        // 직접 비밀은 쿼리에서 제외(조상 비밀은 아래에서 한 번 더 거른다).
        ...(familyOnly ? { secret: false } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: PER,
    }),
    prismaPublic.baby.findMany({
      where: { familyId, deletedAt: null, name: like },
      select: { id: true, name: true },
      take: PER,
    }),
    input.facesEnabled
      ? prismaMedia.person.findMany({
          where: { familyId, name: like },
          select: { id: true, name: true },
          take: PER,
        })
      : Promise.resolve([] as { id: string; name: string | null }[]),
  ])

  // 앨범: family 역할에겐 조상이 비밀인 앨범도 숨긴다(listAlbums 와 동일 규칙).
  let albums = albumRows
  if (familyOnly && albumRows.length > 0) {
    const visible = await Promise.all(
      albumRows.map(async (a) =>
        (await isAlbumSecretForViewer({ albumId: a.id, familyId, viewerRole }, prismaPublic))
          ? null
          : a,
      ),
    )
    albums = visible.filter((a): a is { id: string; name: string } => a !== null)
  }

  const stories = storyRows.map((s) => ({
    id: s.id,
    publicNo: s.publicNo,
    title: s.title,
    snippet: snippetFrom(s.body, q),
    entryDate: s.entryDate,
  }))
  const milestones = milestoneRows.map((m) => ({
    id: m.id,
    label: m.customLabel ?? '',
    note: m.note,
    achievedAt: m.achievedAt,
    babyId: m.babyId,
  }))
  const babies = babyRows
  const people = personRows
    .filter(
      (p): p is { id: string; name: string } => typeof p.name === 'string' && p.name.length > 0,
    )
    .map((p) => ({ id: p.id, name: p.name }))

  const total = stories.length + milestones.length + albums.length + babies.length + people.length
  return { query: q, stories, milestones, albums, babies, people, total }
}
