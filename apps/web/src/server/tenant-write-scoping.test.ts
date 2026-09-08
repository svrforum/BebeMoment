import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { TENANT_SCOPED_MODELS } from '@bebe/db-public/src/tenant-middleware'
import { describe, expect, it } from 'vitest'

// 가족 스코프 모델을 `where: { id }` 만으로 수정하면 tenant 확장이 dev 에서 throw 하고
// 프로덕션에선 정상 동작마다 경고를 뿜어, 진짜 격리 사고의 신호를 소음에 묻는다. 실제로
// 앨범 수정·이동·댓글 수정·삭제 5곳이 그렇게 새어 있었다(2026-08-29 구조 감사).
//
// 통합 테스트는 이걸 못 잡는다 — test-db 가 확장을 끼우지 않은 클라이언트를 준다(끼우면
// 정당한 전역 시딩 쿼리까지 막혀 84개 파일이 깨진다). 그래서 정적으로 본다.
// 자매 가드: packages/db-public/src/tenant-scoping-drift.test.ts (모델 집합 누락 검사).
//
// 검사는 인자 전체가 아니라 **where 블록만** 본다 — 예전엔 인자 문자열 전체를 훑어
// `where: { id }, data: { familyId }` 가 통과했다. where 없는 deleteMany/updateMany 는
// 필터가 아예 없는 쓰기라 그 자체가 위반이다.

const WRITE_OPS = ['update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const
const WHERE_OPTIONAL_OPS = new Set<string>(['updateMany', 'deleteMany'])

/** PascalCase 모델명 → Prisma 접근자(camelCase). */
function accessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.endsWith('.test.ts') &&
      !name.endsWith('.test.tsx')
    ) {
      out.push(full)
    }
  }
  return out
}

/** 호출 시작 위치부터 괄호 균형이 맞는 지점까지 — 인자 객체를 통째로 떠낸다. */
function callArgs(src: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < src.length; i += 1) {
    const c = src[i]
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return src.slice(openParen + 1, i)
    }
  }
  return ''
}

/**
 * 인자 객체의 **최상위** `where:` 뒤에 오는 `{ … }` 블록. data 안에 중첩된 where(관계 쓰기)는
 * 무시한다. 없으면 null.
 */
function topLevelWhereBlock(args: string): string | null {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i] as string
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      continue
    }
    if (c === '{' || c === '(' || c === '[') {
      depth += 1
      continue
    }
    if (c === '}' || c === ')' || c === ']') {
      depth -= 1
      continue
    }
    // 인자 객체 리터럴 바로 안쪽(depth 1)의 `where:` 만.
    if (depth === 1 && args.startsWith('where', i) && /[\s,{]/.test(args[i - 1] ?? '{')) {
      const rest = args.slice(i + 'where'.length)
      const m = /^\s*:\s*\{/.exec(rest)
      if (!m) continue
      const open = i + 'where'.length + m[0].length - 1
      let d = 0
      for (let j = open; j < args.length; j += 1) {
        if (args[j] === '{') d += 1
        else if (args[j] === '}') {
          d -= 1
          if (d === 0) return args.slice(open, j + 1)
        }
      }
      return null
    }
  }
  return null
}

type Offence = { file: string; snippet: string }

/**
 * tenant-middleware 의 enforce() 가 허용하는 필터를 그대로 반영한다 — 가드가 미들웨어보다
 * 엄해지면 정당한 호출(Invite+token 등)을 오탐하고, 느슨해지면 존재 의미가 없다.
 */
function isScoped(model: string, where: string): boolean {
  const has = (k: string) => new RegExp(`\\b${k}\\b`).test(where)
  if (has('familyId') || has('family_id')) return true
  if (model === 'family') return has('id') || has('slug')
  if (model === 'invite') return has('token')
  if (model === 'membership') return has('userId') || has('user_id')
  if (model === 'storyAsset' || model === 'milestoneAsset') {
    return has('assetId') || has('asset_id') || has('entryId') || has('entry_id')
  }
  return false
}

function unscopedWrites(files: string[]): Offence[] {
  const offences: Offence[] = []
  const models = [...TENANT_SCOPED_MODELS].map(accessor)
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const model of models) {
      for (const op of WRITE_OPS) {
        const needle = `.${model}.${op}(`
        let at = src.indexOf(needle)
        while (at !== -1) {
          const args = callArgs(src, at + needle.length - 1)
          const where = topLevelWhereBlock(args)
          const offence = where
            ? !isScoped(model, where)
            : WHERE_OPTIONAL_OPS.has(op) && !/\bwhere\b/.test(args)
          if (offence) {
            offences.push({
              file: path.relative(process.cwd(), file),
              snippet: `${model}.${op}${where ? '' : ' (no where)'}`,
            })
          }
          at = src.indexOf(needle, at + 1)
        }
      }
    }
  }
  return offences
}

describe('tenant write scoping guard', () => {
  const roots = [
    path.join(process.cwd(), 'src/server'),
    path.join(process.cwd(), 'scripts'),
    path.join(process.cwd(), 'app'),
  ].filter((d) => {
    try {
      return statSync(d).isDirectory()
    } catch {
      return false
    }
  })
  const files = roots.flatMap(sourceFiles)

  it('actually scanned the server sources', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('reads only the top-level where block', () => {
    expect(topLevelWhereBlock('{ where: { id }, data: { familyId } }')).toBe('{ id }')
    expect(topLevelWhereBlock('{ data: { assets: { deleteMany: { where: { x } } } } }')).toBeNull()
    expect(
      topLevelWhereBlock('{\n  where: { familyId_userId: { familyId, userId } },\n  data: {},\n}'),
    ).toBe('{ familyId_userId: { familyId, userId } }')
    expect(topLevelWhereBlock('')).toBeNull()
  })

  it('treats a family-scoped write without a where as unscoped', () => {
    expect(isScoped('album', '{ id }')).toBe(false)
    expect(isScoped('album', '{ id, familyId }')).toBe(true)
  })

  it('every write on a family-scoped model carries familyId', () => {
    const offences = unscopedWrites(files)
    expect(
      offences.map((o) => `${o.file} — ${o.snippet}`),
      '가족 스코프 모델 수정에는 where 에 familyId 를 포함해야 한다(§8). 읽기 쪽 필터로는 부족하다.',
    ).toEqual([])
  })
})
