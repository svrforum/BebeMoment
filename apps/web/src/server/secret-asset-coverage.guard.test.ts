import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../test-support/source-files'

// 보호자 전용(비밀) 스토리에 담긴 사진은 family 역할에게 사진 바이트까지 숨긴다. 그 필터
// (story/secret-assets.ts)는 각 목록 함수가 직접 불러야 해서, 새 목록·URL 서명 경로가 빠뜨리면
// 그 경로로만 조용히 샌다 — 타입도 통합 테스트도 그걸 모른다. 그래서 정적으로 본다:
// src/server 에서 자산 행을 읽거나 자산 URL 을 서명하는 모듈은 필터를 실제로 부르거나, 왜 안
// 불러도 되는지 한 줄 사유와 함께 아래 허용 목록에 있어야 한다.

const SERVER_ROOT = path.join(process.cwd(), 'src/server')

/** 자산 행 읽기(Prisma·raw SQL) 또는 자산 URL 서명 — 사진을 누군가에게 내보낼 수 있는 지점. */
const EXPOSES_ASSETS: RegExp[] = [
  /\.asset\.(?:findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|groupBy|aggregate)\(/,
  /\b(?:FROM|JOIN)\s+(?:media\.)?"?assets"?\b/i,
  /\.(?:getAssetUrls|getAssetUrlsBatch|mintDownloadUrl)\(/,
]

/** 필터 호출(주석 속 이름 언급은 치지 않는다 — 주석은 먼저 걷어 낸다). */
const APPLIES_FILTER =
  /\b(?:hiddenAssetIdsForViewer|listSecretAssetIds|isAssetHiddenFromViewer)\s*\(/

/** src/server 기준 경로 → 필터 없이 자산을 읽어도 되는 이유. */
const ALLOWLIST: Record<string, string> = {
  'album/attach-assets.ts':
    '쓰기 — 담을 사진 id 가 이 가족 것인지만 확인하고 사진은 돌려주지 않는다',
  'album/update.ts': '쓰기 — 표지로 고른 사진이 이 앨범에 담긴 ready 사진인지만 확인한다',
  'asset/dedupe.ts': '업로드 중복(sha256) 확인 — 올리는 사람이 이미 그 바이트를 갖고 있다',
  'asset/list.ts':
    '운영 코드에서 부르는 곳이 없다(테스트만) — 쓰게 되면 viewerRole 을 받아 거를 것',
  'asset/purge.ts': '쓰기 — 영구 삭제할 행을 찾을 뿐 사진을 돌려주지 않는다',
  'asset/restore.ts': '쓰기 — 복원할 행을 찾을 뿐 사진을 돌려주지 않는다',
  'asset/soft-delete.ts': '쓰기 — 삭제할 행과 권한을 확인할 뿐 사진을 돌려주지 않는다',
  'asset/update-metadata.ts': '쓰기 — 고칠 행과 권한을 확인할 뿐 사진을 돌려주지 않는다',
  'asset/resolve-uuid.ts':
    '순번→UUID 변환만 한다 — 사진은 호출부가 거른 경로(viewer-bundle)로 읽는다',
  'milestone/create.ts': '쓰기 — 붙일 사진 id 가 이 가족의 ready 사진인지 개수만 센다',
  'milestone/update.ts': '쓰기 — 붙일 사진 id 가 이 가족의 ready 사진인지 개수만 센다',
  'people/backfill.ts': '관리자 얼굴 재인식 — 사진 id 를 큐에 넣고 개수만 돌려준다',
  'share/create.ts':
    '발급 때 id 확인만 — 링크를 열 때 photo-set·public-story·public-album 이 비밀 사진을 뺀다',
  'share/date-assets.ts':
    '그 날 사진 id 만 — 공개 화면은 buildPhotoSetPreview 를 거쳐 비밀 사진이 빠진다',
  'share/day-preview.ts': '스토리 표지를 buildPhotoSetPreview 가 이미 거른 사진 중에서만 고른다',
  'story/create.ts': '쓰기 — 담을 사진 id 가 이 가족 것인지 개수만 센다',
  'story/update.ts': '쓰기 — 담을 사진 id 가 이 가족 것인지 개수만 센다',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function exposesAssets(code: string): boolean {
  return EXPOSES_ASSETS.some((re) => re.test(code))
}

function appliesFilter(code: string): boolean {
  return APPLIES_FILTER.test(code)
}

function scan(): { rel: string; exposes: boolean; filters: boolean }[] {
  return sourceFiles(SERVER_ROOT).map((file) => {
    const code = stripComments(readFileSync(file, 'utf8'), file)
    return {
      rel: path.relative(SERVER_ROOT, file).split(path.sep).join('/'),
      exposes: exposesAssets(code),
      filters: appliesFilter(code),
    }
  })
}

describe('비밀 스토리 사진 필터 커버리지', () => {
  const files = scan()

  it('서버 소스를 실제로 훑었다', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.filter((f) => f.exposes).length).toBeGreaterThan(20)
  })

  it('탐지 규칙: Prisma 읽기·raw SQL·URL 서명은 잡고, 주석 속 언급은 필터로 치지 않는다', () => {
    expect(exposesAssets('await prismaMedia.asset.findMany({ where })')).toBe(true)
    expect(exposesAssets('await tx.asset.count({ where })')).toBe(true)
    expect(exposesAssets('SELECT a.id FROM media.assets a')).toBe(true)
    expect(exposesAssets('await media.getAssetUrlsBatch(familyId, ids)')).toBe(true)
    expect(exposesAssets('await prismaPublic.albumAsset.findMany({})')).toBe(false)
    expect(exposesAssets('SELECT asset_id FROM story_assets')).toBe(false)
    expect(appliesFilter(stripComments('// hiddenAssetIdsForViewer(role) 를 쓸 것'))).toBe(false)
    expect(appliesFilter(stripComments('/**\n * listSecretAssetIds(prisma, id) 참고\n */'))).toBe(
      false,
    )
    expect(
      appliesFilter(stripComments('/*\n  hiddenAssetIdsForViewer(role) 를 부를 것\n*/\nfoo()')),
    ).toBe(false)
    expect(appliesFilter('const h = await hiddenAssetIdsForViewer(role, p, f)')).toBe(true)
    expect(stripComments("const m = 'image/*'\nfoo()")).toBe("const m = 'image/*'\nfoo()")
  })

  it('자산을 내보내는 모듈은 비밀 스토리 필터를 부르거나 사유와 함께 허용 목록에 있다', () => {
    const offenders = files
      .filter((f) => f.exposes && !f.filters && !(f.rel in ALLOWLIST))
      .map((f) => f.rel)
    expect(
      offenders,
      '자산을 읽거나 URL 을 서명하는 새 서버 모듈이다. viewerRole 을 받아 hiddenAssetIdsForViewer ' +
        '(story/secret-assets.ts)로 비밀 스토리 사진을 거르거나 — 열린 쿼리는 id notIn, 이미 고른 ' +
        'id 목록은 JS 로 — 정말 필요 없으면 ALLOWLIST 에 한 줄 사유와 함께 넣을 것',
    ).toEqual([])
  })

  it('허용 목록에 낡은 항목이 없다', () => {
    const byRel = new Map(files.map((f) => [f.rel, f]))
    const stale = Object.keys(ALLOWLIST).flatMap((rel) => {
      const f = byRel.get(rel)
      if (!f) return [`${rel} — 파일이 없다`]
      if (!f.exposes) return [`${rel} — 더는 자산을 읽지 않는다`]
      if (f.filters) return [`${rel} — 이제 필터를 부른다`]
      return []
    })
    expect(stale, '허용 목록에서 빼 주세요').toEqual([])
  })
})
