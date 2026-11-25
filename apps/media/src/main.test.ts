import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MEDIA_ROOT = path.resolve(import.meta.dirname, '..')

type Exit = { code: number | null; output: string }

// 컨테이너와 같은 방식(run-app.sh 의 `node --import tsx src/main.ts`)으로 띄운다. env 는 셸에서
// 물려받지 않는다 — 남아 있는 시크릿이 검사를 통과시키지 않게. 접속 정보는 아무 데도 닿지 않는
// 주소라 검사가 빠져 부팅이 이어져도 실제 DB·Redis 에 붙지 않는다.
function runMain(env: Record<string, string>, timeoutMs: number): Promise<Exit> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: MEDIA_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (d) => {
      output += d
    })
    child.stderr.on('data', (d) => {
      output += d
    })
    // 검사가 빠지면 서버가 떠서 끝나지 않는다 — 죽이고 code null 로 실패시킨다.
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', reject)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
}

describe('media boot', () => {
  it('refuses to start a server without its secrets', async () => {
    const { code, output } = await runMain(
      {
        PATH: process.env.PATH ?? '',
        NODE_ENV: 'test',
        MEDIA_ROLE: 'server',
        MEDIA_HOST: '127.0.0.1',
        MEDIA_PORT: '1',
        DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
        REDIS_URL: 'redis://127.0.0.1:1',
        SECRET_KEY: 'test-secret-key-at-least-32-chars!',
        PUBLIC_URL: 'http://localhost:3000',
        STORAGE_PATH: mkdtempSync(path.join(os.tmpdir(), 'bebe-media-boot-')),
      },
      30_000,
    )
    expect(output).toContain('must be set')
    expect(code).toBe(1)
  }, 60_000)
})
