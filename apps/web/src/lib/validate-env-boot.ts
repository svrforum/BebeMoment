import { parseEnv } from '@bebe/config'

// Node 런타임 전용 부팅 검증 — instrumentation.ts 가 nodejs 분기에서만 동적 import 한다.
// process.exit 는 Edge 런타임 미지원이라, 별도 모듈로 분리해 Edge 번들에 들어가지 않게 한다.
export function validateEnvAtBoot(): void {
  try {
    parseEnv(process.env as Record<string, string | undefined>)
  } catch (e) {
    const msg = `[bebe] invalid environment:\n${(e as Error).message}`
    if (process.env.NODE_ENV === 'production') {
      console.error(`\n${msg}\n→ refusing to boot. Fix the above and restart.\n`)
      process.exit(1)
    } else {
      console.warn(`\n${msg}\n(dev: continuing)\n`)
    }
  }
}
