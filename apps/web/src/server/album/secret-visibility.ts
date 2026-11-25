import type { Album, PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import { NotFoundError } from '../error'

/** 트랜잭션 안에서도 부를 수 있게 앨범 테이블만 요구한다. */
type AlbumReader = Pick<PrismaPublic, 'album'>

/** 비밀은 하위로 상속된다 — 자신이나 path 위의 조상 하나라도 비밀이면 비밀. */
async function isSecretRow(
  album: Pick<Album, 'secret' | 'path'>,
  familyId: string,
  prisma: AlbumReader,
): Promise<boolean> {
  if (album.secret) return true
  const ancestorIds = album.path.split('/').filter(Boolean)
  if (ancestorIds.length === 0) return false
  const ancestors = await prisma.album.findMany({
    where: { id: { in: ancestorIds }, familyId },
    select: { secret: true },
  })
  return ancestors.some((a) => a.secret)
}

/**
 * 역할 무관 — 이 앨범이 비밀이거나(자신) 비밀 조상 아래 있는지. 인증 경계 밖(공유 링크)에서는
 * "누가 만들든" 트리에서 숨겨진 앨범을 공개하면 안 되므로 viewerRole 없이 판정한다.
 */
export async function isAlbumSecretOrUnderSecret(
  args: { albumId: string; familyId: string },
  prisma: AlbumReader,
): Promise<boolean> {
  const album = await prisma.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
    select: { secret: true, path: true },
  })
  return album ? isSecretRow(album, args.familyId, prisma) : false
}

/**
 * family 역할에게 이 앨범이 비밀(자신 또는 조상이 secret)인지 — 즉 숨겨야 하는지.
 * owner/guardian 은 항상 false(전부 보임). 존재하지 않는 앨범은 false(호출부가 별도 처리).
 * 자식 목록·통합 검색이 이걸로 막는다(트리·상세·앨범 검색은 이미 읽어 온 행으로 직접 판정하고,
 * 사진·스토리 목록은 isAlbumContentHiddenFromViewer, 쓰기는 findVisibleAlbumOrThrow 를 쓴다).
 */
export async function isAlbumSecretForViewer(
  args: { albumId: string; familyId: string; viewerRole: Role },
  prisma: AlbumReader,
): Promise<boolean> {
  if (args.viewerRole !== 'family') return false
  return isAlbumSecretOrUnderSecret({ albumId: args.albumId, familyId: args.familyId }, prisma)
}

/**
 * 앨범의 사진·스토리 목록을 이 뷰어에게 비워 보여야 하는지 — 없거나 지운 앨범(누구에게나),
 * 그리고 family 에게 비밀인 앨범. 지운 앨범은 isAlbumSecretForViewer(살아 있는 앨범만 본다)를
 * 그냥 지나치므로 여기서 함께 막는다.
 */
export async function isAlbumContentHiddenFromViewer(
  args: { albumId: string; familyId: string; viewerRole: Role },
  prisma: AlbumReader,
): Promise<boolean> {
  const album = await prisma.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
    select: { secret: true, path: true },
  })
  if (!album) return true
  if (args.viewerRole !== 'family') return false
  return isSecretRow(album, args.familyId, prisma)
}

/**
 * 이 앨범 아래(자신 제외)에 살아 있는 비밀 앨범이 있는지. family 가 하위째 지우거나 옮길 때 보호자가
 * 숨겨 둔 앨범까지 끌고 가지 않게 막는다 — 그대로 두면 하위 개수·깊이 계산이 숨긴 앨범까지 세어
 * 거절 문구로 그 존재가 드러난다.
 */
export async function hasSecretDescendant(
  album: Pick<Album, 'path'>,
  familyId: string,
  prisma: AlbumReader,
): Promise<boolean> {
  const row = await prisma.album.findFirst({
    where: { familyId, path: { startsWith: `${album.path}/` }, secret: true, deletedAt: null },
    select: { id: true },
  })
  return row !== null
}

/**
 * 앨범 쓰기(담기·빼기·고치기·지우기·옮기기·하위 만들기)가 대상 앨범을 찾는 유일한 길.
 * 없거나 지운 앨범과 이 뷰어(family)에게 비밀인 앨범을 똑같이 `notFoundKey` 로 거절한다 —
 * 비밀 앨범 UUID 를 알아낸 family 가 그 앨범을 고치거나 비울 수 있었고, 응답이 '없는 앨범' 과
 * 다르면(403·성공) 숨긴 앨범이 거기 있다는 사실이 드러났다. 그래서 앨범을 보고 판단하는 권한
 * 확인(자기 앨범인지 등)보다 먼저 부른다.
 */
export async function findVisibleAlbumOrThrow(
  args: { albumId: string; familyId: string; viewerRole: Role },
  prisma: AlbumReader,
  notFoundKey:
    | 'album.notFound'
    | 'album.parentNotFound'
    | 'album.moveTargetNotFound' = 'album.notFound',
): Promise<Album> {
  const album = await prisma.album.findFirst({
    where: { id: args.albumId, familyId: args.familyId, deletedAt: null },
  })
  if (!album || (args.viewerRole === 'family' && (await isSecretRow(album, args.familyId, prisma))))
    throw new NotFoundError(notFoundKey)
  return album
}
