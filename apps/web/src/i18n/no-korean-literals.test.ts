import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/
const ROOTS = ['app/api', 'src/server'].map((d) => path.join(process.cwd(), d))

/**
 * 아직 카탈로그로 못 옮긴 곳. **여기 새 항목을 추가하지 말 것** — 새 사용자 문구는
 * `errors.<key>`(ServiceError·zod 메시지) 나 네임스페이스 키로 만든다.
 *
 * - `src/server/album/*`: 다른 워크스트림이 같은 사이클에 편집 중이라 손대지 않았다.
 *   세 문구 모두 개수·깊이가 들어가는 동적 메시지라 ICU placeholder 키가 필요하다
 *   (`errors.album.maxDepth` / `errors.album.hasChildren`).
 * - `src/server/backup/*`: 관리자 복구 콘솔과 컨테이너 stdout 으로 나가는 **운영자용
 *   진행 로그·진단 문자열**이다(psql stderr, 체인 id, 경로). 요청 로케일이 없는 CLI
 *   복구 경로에서도 같은 코드가 돌아 별도 설계가 필요하다.
 */
const ALLOWLIST = [
  'src/server/album/create.ts',
  'src/server/album/delete.ts',
  'src/server/album/move.ts',
  'src/server/backup/chain.ts',
  'src/server/backup/remote.ts',
  'src/server/backup/restore.ts',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/** 주석을 지운 소스 — 주석의 한국어는 허용(§6.6 은 한/영 혼용 OK). */
function stripComments(src: string): string {
  let out = ''
  let state: 'code' | 'line' | 'block' | 'str' = 'code'
  let quote = ''
  for (let i = 0; i < src.length; ) {
    const c = src[i] as string
    const c2 = src[i + 1]
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        state = 'line'
        i += 2
      } else if (c === '/' && c2 === '*') {
        state = 'block'
        i += 2
      } else {
        if (c === '"' || c === "'" || c === '`') {
          state = 'str'
          quote = c
        }
        out += c
        i += 1
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      }
      i += 1
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') {
        state = 'code'
        i += 2
      } else {
        if (c === '\n') out += c
        i += 1
      }
    } else {
      if (c === '\\') {
        out += c + (c2 ?? '')
        i += 2
      } else {
        if (c === quote) state = 'code'
        out += c
        i += 1
      }
    }
  }
  return out
}

/**
 * 서버가 사용자에게 보내는 문구는 카탈로그를 지나야 요청 로케일로 번역된다. zod 메시지에
 * 한국어를 박으면 `errorJsonText` 로 그대로 나가고, `throw new Error('한국어')` 는
 * `errors.badRequest` 의 raw message 로 새어 영어 UI 에서도 한국어가 보인다 — 실제로
 * 20개 파일 40군데가 그랬다. 주석은 예외(§6.6).
 */
describe('서버 소스에 사용자용 한국어 리터럴이 없다', () => {
  it('app/api·src/server 어디에도 (주석 밖) 한글이 없다', () => {
    const allow = new Set(ALLOWLIST)
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const rel = path.relative(process.cwd(), file)
      if (allow.has(rel)) continue
      const stripped = stripComments(readFileSync(file, 'utf8'))
      stripped.split('\n').forEach((line, i) => {
        if (HANGUL.test(line)) offenders.push(`${rel}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('허용 목록은 실제로 아직 한글이 있는 파일만 담는다', () => {
    const stale = ALLOWLIST.filter((rel) => {
      const full = path.join(process.cwd(), rel)
      return !HANGUL.test(stripComments(readFileSync(full, 'utf8')))
    })
    expect(stale).toEqual([])
  })
})
