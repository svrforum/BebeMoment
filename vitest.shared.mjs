import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// 패키지 vitest 설정들이 가져다 쓰는 조각. 루트 vitest 설정은 없다 — 테스트는 패키지 안에서
// 돌린다(`pnpm --filter <pkg> exec vitest run <file>`). 여러 테스트가 process.cwd() 를 패키지
// 루트로 가정하기 때문이다. 설정 파일이 확장자를 붙여 import 할 수 있게 맨 JS 로 둔다.

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'generated'])

/**
 * @param {string} dir
 * @param {string} suffix
 * @param {string[]} out
 */
function walk(dir, suffix, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, suffix, out)
    } else if (e.name.endsWith(suffix)) {
      out.push(full)
    }
  }
}

/**
 * include 글롭이 가리키는 파일들. '디렉터리 + 재귀 + 접미사' 모양과 리터럴 경로만 안다.
 * @param {string} root
 * @param {string[]} include
 * @returns {string[]}
 */
function filesForInclude(root, include) {
  /** @type {string[]} */
  const out = []
  for (const glob of include) {
    const m = /^(.+)\/\*\*\/\*(\.[\w.]+)$/.exec(glob)
    if (m) {
      walk(path.join(root, m[1]), m[2], out)
    } else if (/[*?[\]{}]/.test(glob)) {
      // 모르는 모양을 대충 넘기면 컨테이너가 필요한 파일이 유닛 쪽에 섞여도 아무도 모른다.
      throw new Error(`vitest.shared: unsupported include glob "${glob}"`)
    } else {
      out.push(path.join(root, glob))
    }
  }
  return out
}

/**
 * app/api/[id]/… 같은 경로를 글롭에 그대로 넣으면 [id] 가 문자 클래스가 된다.
 * @param {string} p
 */
function escapeGlob(p) {
  return p.replace(/[[\]{}()*?!+@]/g, '\\$&')
}

/**
 * 테스트 DB 를 쓰는 파일. 헬퍼를 부르는 자리(`startTestDb(`·`startFullTestDb(`)와, 어떤 경로로든
 * test-db·test-support/db 를 가져오는 import 를 둘 다 본다 — import 경로 하나만 보면 상대 경로나
 * 다시 내보낸 헬퍼를 놓친다. 놓친 파일은 컨테이너 없는 unit 프로젝트에서 돌고, 거기선 접속
 * 정보(DATABASE_URL*·REDIS_URL)가 지워져 있고 Valkey 도 없어 대개 깨진다.
 */
export const USES_TEST_DB = /\bstart(?:Full)?TestDb\(|['"][^'"\n]*\/test(?:-support\/db|-db)['"]/

/**
 * include 가 고르는 테스트 파일 중 본문이 `needsContainers` 에 걸리는 것 — 패키지 루트 기준
 * 상대 경로를 글롭용으로 이스케이프해 돌려준다. 설정을 읽을 때마다 다시 계산하므로 새 테스트는
 * 이름 규칙 없이 import 만으로 알맞은 프로젝트에 들어간다.
 * @param {string} root
 * @param {string[]} include
 * @param {RegExp} needsContainers
 * @returns {string[]}
 */
export function testFilesMatching(root, include, needsContainers) {
  return [...new Set(filesForInclude(root, include))]
    .filter((file) => {
      try {
        return needsContainers.test(readFileSync(file, 'utf8'))
      } catch {
        return false
      }
    })
    .map((file) => escapeGlob(path.relative(root, file).split(path.sep).join('/')))
    .sort()
}
