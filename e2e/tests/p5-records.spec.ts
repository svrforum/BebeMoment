import { expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'

test.describe('P5 records smoke', () => {
  // 인스턴스당 가족 1개 — 스펙마다 깨끗한 DB 에서 시작해야 가입이 열린다.
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('성장 기록 → 기록(마일스톤) → 목록에 남는다', async ({ page }) => {
    const uniq = Date.now()

    await page.goto('/')
    await useKorean(page)
    await signUpAsOwner(page, {
      username: `p5u${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'P5 User',
    })
    await completeOnboarding(page, {
      familyName: `P5 Family ${uniq}`,
      babyName: 'P5 Baby',
      birthDate: '2026-01-01',
    })

    // babyId 는 아기 목록의 링크에서 얻는다. 예전엔 /journal/new 의 <select> 에서 읽었는데
    // 그 화면은 스토리로 대체됐다(그리고 스토리는 이제 사진이 최소 1장 필요하다).
    await page.goto('/babies')
    // '/babies/new'(추가 링크)가 먼저 잡히므로 제외한다.
    const babyHref = await page
      .locator('main a[href^="/babies/"]:not([href="/babies/new"])')
      .first()
      .getAttribute('href')
    const babyId = babyHref?.split('/')[2] ?? ''
    expect(babyId).toMatch(/^[0-9a-f-]{36}$/)

    // 성장 기록
    await page.goto(`/babies/${babyId}/growth/new`)
    await page.locator('input#measuredAt').fill('2026-04-15')
    await page.locator('input#weightKg').fill('7.2')
    await page.locator('input#heightCm').fill('65.5')
    await page.getByRole('button', { name: /저장/ }).click()
    await page.waitForURL(/\/growth$/, { timeout: 30_000 })
    await expect(page.getByText(/7\.20kg/)).toBeVisible()

    // 기록(프리셋 '첫 웃음')
    await page.goto(`/babies/${babyId}/milestones/new?presetKey=first_smile`)
    await page.locator('input#achievedAt').fill('2026-02-15')
    await page.getByRole('button', { name: /저장/ }).click()
    await page.waitForURL(/\/milestones$/, { timeout: 30_000 })
    await expect(page.getByText('첫 웃음')).toBeVisible()

    // 검색이 프리셋 라벨로 그 기록을 찾는다 — 라벨은 DB 가 아니라 core 에만 있어서
    // 예전에는 이 검색이 아무것도 못 찾았다(감사에서 확인된 결함).
    await page.goto('/search?q=%EC%B2%AB%20%EC%9B%83%EC%9D%8C')
    await expect(page.getByText('첫 웃음').first()).toBeVisible({ timeout: 20_000 })
  })
})
