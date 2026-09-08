// 빌드 전용. `pnpm install --prod` 뒤에도 node_modules/.pnpm 에는 아무 패키지도 가리키지 않는
// 디렉터리가 남는다(제거된 devDependency 의 optionalDependencies — biome CLI 바이너리, e2e 의
// 옛 sharp, rolldown 등 100MB+). 워크스페이스 각 패키지의 node_modules 심링크에서 출발해
// 실제로 도달 가능한 store 디렉터리만 남기고 나머지를 지운다.
//   node docker/prune-store.mjs [--dry-run]
import { lstatSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const store = path.join(root, 'node_modules', '.pnpm')
const dryRun = process.argv.includes('--dry-run')

function listPackageLinks(nodeModulesDir) {
  const out = []
  let entries = []
  try {
    entries = readdirSync(nodeModulesDir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = path.join(nodeModulesDir, name)
    if (name.startsWith('@')) {
      for (const sub of readdirSync(full)) out.push(path.join(full, sub))
    } else {
      out.push(full)
    }
  }
  return out
}

function storeKeyOf(realPath) {
  const rel = path.relative(store, realPath)
  if (rel.startsWith('..')) return null
  return rel.split(path.sep)[0]
}

const used = new Set()
const queue = []
function visit(linkPath) {
  let target
  try {
    target = realpathSync(linkPath)
  } catch {
    return
  }
  const key = storeKeyOf(target)
  if (key) {
    if (used.has(key)) return
    used.add(key)
    // 그 패키지의 의존성 링크들(.pnpm/<key>/node_modules/*)로 이어간다.
    for (const dep of listPackageLinks(path.join(store, key, 'node_modules'))) queue.push(dep)
    return
  }
  // 워크스페이스 패키지(packages/*, apps/*)면 그 node_modules 도 출발점이다.
  for (const dep of listPackageLinks(path.join(target, 'node_modules'))) queue.push(dep)
}

const importers = [root]
for (const group of ['apps', 'packages']) {
  const dir = path.join(root, group)
  try {
    for (const name of readdirSync(dir)) importers.push(path.join(dir, name))
  } catch {}
}
for (const imp of importers) {
  try {
    statSync(path.join(imp, 'package.json'))
  } catch {
    continue
  }
  for (const link of listPackageLinks(path.join(imp, 'node_modules'))) queue.push(link)
}
while (queue.length) visit(queue.pop())

let removed = 0
let bytes = 0
function sizeOf(dir) {
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = lstatSync(full)
    if (st.isDirectory()) total += sizeOf(full)
    else total += st.size
  }
  return total
}
for (const key of readdirSync(store)) {
  if (key === 'node_modules' || key.startsWith('.') || key === 'lock.yaml') continue
  const full = path.join(store, key)
  if (!lstatSync(full).isDirectory()) continue
  if (used.has(key)) continue
  const size = sizeOf(full)
  bytes += size
  removed += 1
  console.log(`${dryRun ? 'would remove' : 'remove'} ${(size / 1048576).toFixed(1)}MB ${key}`)
  if (!dryRun) rmSync(full, { recursive: true, force: true })
}
// 지워진 디렉터리를 가리키던 hoisted 링크는 정리해 둔다(남아 있어도 해가 없지만 혼란스럽다).
const hoisted = path.join(store, 'node_modules')
for (const link of listPackageLinks(hoisted)) {
  try {
    readlinkSync(link)
    statSync(link)
  } catch {
    if (!dryRun) rmSync(link, { force: true })
  }
}
console.log(
  `${dryRun ? 'would remove' : 'removed'} ${removed} unreferenced store dirs, ${(bytes / 1048576).toFixed(0)}MB; ${used.size} kept`,
)
