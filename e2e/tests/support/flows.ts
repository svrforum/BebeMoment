import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * 가입·온보딩처럼 모든 스펙이 반복하는 흐름.
 *
 * 예전엔 세 스펙이 각자 폼을 채웠고, 가입 화면이 아이디 기반 4단계 위저드로 바뀌자 세 개가
 * 한꺼번에 죽었다 — 그리고 CI 에서 안 돌았으므로 두 달 넘게 아무도 몰랐다. 화면이 바뀌면
 * 여기 한 곳만 고치면 되게 모아 둔다.
 *
 * 셀렉터는 **문구가 아니라 구조**로 잡는다. 라벨·버튼 텍스트는 번역되고 브라우저의 기본
 * 로케일에 따라 영어로 뜨기도 해서, 문구에 기대면 또 조용히 썩는다.
 */

/** 브라우저 로케일과 무관하게 한국어 화면으로 고정한다. */
export async function useKorean(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'locale',
      value: 'ko',
      url: page.url().startsWith('http') ? page.url() : 'http://localhost:3199',
    },
  ])
}

/** 위저드의 '다음/계속' 버튼 — 각 단계의 마지막 활성 버튼. */
async function next(page: Page): Promise<void> {
  const btn = page.locator('main button:visible:not([disabled])').last()
  await btn.click()
}

export type SignUpInput = {
  username: string
  password: string
  displayName: string
  email?: string
}

/**
 * 첫 사용자(owner) 가입. 단계: 아이디 → 비밀번호 → 이름 → 이메일(선택).
 * 성공하면 /onboarding 에 도착한다.
 */
export async function signUpAsOwner(page: Page, input: SignUpInput): Promise<void> {
  await page.goto('/signup')
  await page.locator('input[autocomplete="username"]').fill(input.username)
  await next(page)

  const pw = page.locator('input[autocomplete="new-password"]')
  await expect(pw.first()).toBeVisible()
  await pw.first().fill(input.password)
  await pw.nth(1).fill(input.password)
  await next(page)

  await page.locator('input[autocomplete="name"]').fill(input.displayName)
  await next(page)

  // 이메일은 선택 — 비워도 넘어간다.
  if (input.email) await page.locator('input[type="email"]').fill(input.email)
  await Promise.all([page.waitForURL(/\/onboarding$/, { timeout: 20_000 }), next(page)])
}

/** 가족·아기를 만들고 타임라인까지 간다. */
export async function completeOnboarding(
  page: Page,
  input: { familyName: string; babyName: string; birthDate: string },
): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding$/)
  // 온보딩 입력에는 type 속성이 없다(암묵적 text) — [type="text"] 로는 안 잡히고,
  // 서버 액션 폼이 심는 hidden input 이 먼저 걸리므로 보이는 것만 고른다.
  const text = page.locator('main input:visible:not([type="date"])')
  await text.first().fill(input.familyName)
  await next(page)
  await expect(text.first()).toHaveValue('')
  await text.first().fill(input.babyName)
  await next(page)
  await page.locator('main input[type="date"]').fill(input.birthDate)
  await Promise.all([page.waitForURL(/\/timeline$/, { timeout: 20_000 }), next(page)])
}

/**
 * 스펙마다 DB 를 비운다.
 *
 * 이 앱은 인스턴스당 가족 1개다 — 첫 가족이 생기면 가입이 닫힌다(`isRegistrationOpen`).
 * 그래서 스펙 3개가 한 DB 를 공유하면 첫 스펙만 가입할 수 있고 나머지는 조용히 다른 곳에서
 * 실패한다(실행 순서에 따라 증상이 바뀌어 더 헷갈린다). 각자 깨끗한 DB 에서 시작하게 한다.
 *
 * 대상은 run-smoke.sh 가 띄운 e2e 전용 스택뿐이다(다른 포트·tmpfs). 운영 DB 를 가리킬 수
 * 없게 스크립트가 먼저 막는다.
 */
export async function resetDatabase(): Promise<void> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  const sql = `TRUNCATE TABLE media.asset_babies, media.assets, public.invites, public.memberships, public.babies, public.families, public.sessions, public.oidc_identities, public.users, public.app_settings, public.setting_history RESTART IDENTITY CASCADE;`
  const args = [
    ...(process.env.BEBE_E2E_SUDO === '1' ? ['-n', 'docker'] : ['docker']),
    'exec',
    '-i',
    'bebe-e2e-postgres-1',
    'psql',
    '-U',
    'bebe',
    '-d',
    'bebe',
    '-q',
    '-c',
    sql,
  ]
  const cmd = process.env.BEBE_E2E_SUDO === '1' ? 'sudo' : args.shift()
  await run(cmd as string, args)
}
