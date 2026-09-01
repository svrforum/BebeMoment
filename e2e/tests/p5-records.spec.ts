import { expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'

test.describe('P5 records smoke', () => {
  // 인스턴스당 가족 1개 — 스펙마다 깨끗한 DB 에서 시작해야 가입이 열린다.
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('growth record → milestone → journal → timeline integration', async ({ page }) => {
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

    // 2. Discover babyId via /journal/new — baby <option> carries the uuid
    await page.goto('/journal/new')
    const babyId = await page
      .locator('select[name="babyId"] option', { hasText: 'P5 Baby' })
      .getAttribute('value')
    expect(babyId).toMatch(/^[0-9a-f-]{36}$/)

    // 3. Navigate to baby detail → growth (direct URL to avoid relying
    //    on client-side link navigation, which is slow on first compile).
    await page.goto(`/babies/${babyId}/growth`)
    await expect(page.getByText(/첫 성장 기록/)).toBeVisible({ timeout: 30_000 })

    // 4. Create growth record
    await page.goto(`/babies/${babyId}/growth/new`)
    await page.locator('input#measuredAt').fill('2026-04-15')
    await page.locator('input#weightKg').fill('7.2')
    await page.locator('input#heightCm').fill('65.5')
    await page.getByRole('button', { name: /저장/ }).click()
    await page.waitForURL(/\/growth$/, { timeout: 30_000 })
    await expect(page.getByText(/7\.20kg/)).toBeVisible()

    // 5. Milestone — "첫 웃음" (preset key 'first_smile')
    await page.goto(`/babies/${babyId}/milestones/new?presetKey=first_smile`)
    await page.locator('input#achievedAt').fill('2026-02-15')
    await page.getByRole('button', { name: /저장/ }).click()
    await page.waitForURL(/\/milestones$/, { timeout: 30_000 })
    await expect(page.getByText('첫 웃음')).toBeVisible()

    // 6. Journal entry
    await page.goto('/journal/new')
    await page.locator('input#entryDate').fill('2026-04-20')
    await page.locator('input#title').fill('첫 기록')
    await page.locator('textarea#body').fill('가족 여행 가서 행복했음')
    await page.getByRole('button', { name: /저장/ }).click()
    await page.waitForURL(/\/journal$/, { timeout: 30_000 })
    await expect(page.getByText('첫 기록')).toBeVisible()

    // 7. Timeline shows the journal entry
    await page.goto('/timeline')
    await expect(page.getByText('첫 기록')).toBeVisible()
  })
})
