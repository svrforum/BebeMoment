import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WEB_ROOT } from './test-support/source-files'

// 이 리포는 공개다. 관리자 로컬에만 있는 작업 노트(아래 패턴이 가리키는 파일들)는 gitignore
// 대상이라 리포를 받은 사람에게 없다 — 그 절 번호나 파일 이름을 가리키는 주석은 끊어진
// 참조라서 읽는 사람은 이유를 알 수 없다. 참조 대신 이유를 그 자리에 쓴다.
// 마크다운 문서는 보지 않는다 — 문서는 사람용이라 다른 규칙으로 관리한다.

const REPO_ROOT = path.resolve(WEB_ROOT, '../..')

const PRIVATE_REFERENCES: { name: string; re: RegExp }[] = [
  { name: '노트 절 번호(§N)', re: /§\s?\d/ },
  { name: '노트 절 이름(§name)', re: /§[A-Za-z가-힣]/ },
  { name: '노트 링크([[note-name]])', re: /\[\[[a-z0-9]+(?:-[a-z0-9]+)+\]\]/ },
  { name: 'CLAUDE.md', re: /\bCLAUDE\.md\b/ },
  { name: 'docs/superpowers', re: /\bdocs\/superpowers\b/ },
  { name: '.claude', re: /(?<![\w.-])\.claude(?![\w-])/ },
]

const ALL_NAMES = PRIVATE_REFERENCES.map((p) => p.name)
const MIGRATION_REASON =
  '적용된 마이그레이션은 고치지 않는다 — 내용이 바뀌면 DB 에 기록된 체크섬과 어긋난다'

/**
 * 리포 루트 기준 경로 → 그 파일에 있어도 되는 패턴과 이유. 파일 단위가 아니라 패턴 단위다 —
 * 무시 목록이 `.claude` 를 적는 건 괜찮아도 같은 파일에 절 번호가 새로 붙으면 잡혀야 한다.
 */
const ALLOWLIST: Record<string, { names: string[]; reason: string }> = {
  '.gitignore': {
    names: ['CLAUDE.md', '.claude', 'docs/superpowers'],
    reason: '그 파일들을 커밋에서 빼는 목록 자체다',
  },
  '.dockerignore': {
    names: ['.claude'],
    reason: '이미지 빌드 컨텍스트에서 같은 파일들을 빼는 목록이다',
  },
  'biome.jsonc': {
    names: ['.claude'],
    reason: '린트 대상에서 에이전트 worktree 사본을 빼는 목록이다',
  },
  'scripts/check-line-limit.sh': {
    names: ['.claude'],
    reason: '줄 수 검사에서 에이전트 worktree 사본을 빼는 목록이다 — 같은 파일을 두 번 세지 않게',
  },
  'packages/db-public/prisma/migrations/20260604000000_widget_source/migration.sql': {
    names: ['노트 절 번호(§N)'],
    reason: MIGRATION_REASON,
  },
  'packages/db-public/prisma/migrations/20260828000000_widget_photos/migration.sql': {
    names: ['노트 절 번호(§N)'],
    reason: MIGRATION_REASON,
  },
  'apps/web/src/repo-hygiene.guard.test.ts': {
    names: ALL_NAMES,
    reason: '이 가드 자신 — 찾는 패턴과 그 예시를 담고 있다',
  },
}

const allowed = (rel: string, name: string): boolean =>
  ALLOWLIST[rel]?.names.includes(name) ?? false

const MARKDOWN = /\.mdx?$/i

function privateReferences(text: string): { line: number; name: string }[] {
  const hits: { line: number; name: string }[] = []
  text.split('\n').forEach((line, i) => {
    for (const { name, re } of PRIVATE_REFERENCES) {
      if (re.test(line)) hits.push({ line: i + 1, name })
    }
  })
  return hits
}

function trackedTextFiles(): { rel: string; text: string }[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const files: { rel: string; text: string }[] = []
  for (const rel of out.split('\0')) {
    if (!rel || MARKDOWN.test(rel)) continue
    let buf: Buffer
    try {
      buf = readFileSync(path.join(REPO_ROOT, rel))
    } catch {
      continue // 워킹트리에서 지웠지만 아직 커밋 전인 파일
    }
    // NUL 이 있으면 바이너리(글꼴·이미지·jar) — git 과 같은 판정이다.
    if (buf.includes(0)) continue
    files.push({ rel, text: buf.toString('utf8') })
  }
  return files
}

describe('공개 리포에 비공개 노트 참조가 없다', () => {
  const files = trackedTextFiles()
  const scanned = files.map((f) => ({ rel: f.rel, hits: privateReferences(f.text) }))

  it('추적 파일을 실제로 훑었다', () => {
    expect(files.length).toBeGreaterThan(500)
    expect(files.some((f) => f.rel === 'apps/web/package.json')).toBe(true)
  })

  it('탐지 규칙: 절 번호·노트 링크·노트 파일 이름은 잡고, 비슷한 평범한 글은 넘긴다', () => {
    const flagged = (s: string) => privateReferences(s).map((h) => h.name)
    expect(flagged('// 벽시계-as-UTC(§17#45)')).toEqual(['노트 절 번호(§N)'])
    expect(flagged('tenant 미들웨어(§8)')).toEqual(['노트 절 번호(§N)'])
    expect(flagged('(§ 6.5)')).toEqual(['노트 절 번호(§N)'])
    expect(flagged('(§signed-url)')).toEqual(['노트 절 이름(§name)'])
    expect(flagged('(§조용한 실패 금지)')).toEqual(['노트 절 이름(§name)'])
    expect(flagged('— [[some-private-note]]')).toEqual(['노트 링크([[note-name]])'])
    expect(flagged('see CLAUDE.md for details')).toEqual(['CLAUDE.md'])
    expect(flagged('docs/superpowers/plans/x')).toEqual(['docs/superpowers'])
    expect(flagged('.claude/hooks/x.sh')).toEqual(['.claude'])
    expect(flagged('"!**/.claude",')).toEqual(['.claude'])

    expect(flagged('const pairs = [[0, 1]]')).toEqual([])
    expect(flagged("const ids = [['a']]")).toEqual([])
    expect(flagged('model: vendor.claude-x')).toEqual([])
    expect(flagged('CLAUDE_MD_PATH')).toEqual([])
    expect(flagged('docs/deployment-linux.md 참고')).toEqual([])
  })

  it('마크다운이 아닌 추적 파일은 비공개 노트를 가리키지 않는다', () => {
    const offenders = scanned.flatMap((f) =>
      f.hits.filter((h) => !allowed(f.rel, h.name)).map((h) => `${f.rel}:${h.line} ${h.name}`),
    )
    expect(
      offenders,
      '공개 리포를 받은 사람에게는 없는 노트를 가리킨다. 참조 대신 이유를 그 자리에 몇 마디로 ' +
        '쓰거나, 주변 주석이 이미 이유를 말하면 참조만 지울 것',
    ).toEqual([])
  })

  it('허용 목록에 낡은 항목이 없다', () => {
    const byRel = new Map(scanned.map((f) => [f.rel, f]))
    const stale = Object.entries(ALLOWLIST).flatMap(([rel, { names }]) => {
      const f = byRel.get(rel)
      if (!f) return [`${rel} — 추적 파일이 아니다`]
      // 가드 자신은 모든 패턴의 예시를 담지만, 패턴 하나하나가 실제로 걸리는지는 위 탐지 규칙
      // 테스트가 본다.
      if (rel === 'apps/web/src/repo-hygiene.guard.test.ts') return []
      return names
        .filter((name) => !f.hits.some((h) => h.name === name))
        .map((name) => `${rel} — '${name}' 가 더는 걸리지 않는다`)
    })
    expect(stale, '허용 목록에서 빼 주세요').toEqual([])
  })
})
