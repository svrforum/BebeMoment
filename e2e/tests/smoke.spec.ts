import { expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'
import { uploadOnePhoto, waitForTimelineThumb } from './support/upload'

test.describe('bebe-moment P1+P2+P3 smoke', () => {
  // 인스턴스당 가족 1개 — 스펙마다 깨끗한 DB 에서 시작해야 가입이 열린다.
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('signup → onboarding → upload via FAB → timeline thumb → detail', async ({
    page,
  }, testInfo) => {
    const uniq = Date.now()
    const familyName = `Smoke Family ${uniq}`

    await page.goto('/')
    await useKorean(page)
    // 첫 사용자가 없으면 루트는 /signup 으로 보낸다(가입 개방 = 가족 0개).
    await expect(page).toHaveURL(/\/signup$/)

    await signUpAsOwner(page, {
      username: `smoke${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'Smoke Tester',
    })
    await completeOnboarding(page, {
      familyName,
      babyName: 'Smoke Baby',
      birthDate: '2026-01-01',
    })

    // Timeline with family name as heading
    await expect(page.getByRole('heading', { name: familyName })).toBeVisible()
    // 빈 상태 문구(timeline.grid.emptyTitle)
    await expect(page.getByText(/아직 올라온 사진이 없어요/)).toBeVisible()

    await uploadOnePhoto(page, testInfo, `smoke-${uniq}.jpg`)

    expect(await waitForTimelineThumb(page)).toBeTruthy()

    // Click first thumb in a bucket section → detail page
    const detailLink = page.locator('main a[href^="/detail/"]').first()
    const detailHref = await detailLink.getAttribute('href')
    expect(detailHref).toMatch(/^\/detail\/[0-9a-f-]+$/)
    await Promise.all([
      page.waitForURL(/\/detail\/[0-9a-f-]+$/, { timeout: 10_000 }),
      detailLink.click(),
    ])

    // Detail page renders side panel heading (P6 UI — filename removed)
    await expect(page.getByRole('heading', { name: '세부정보' })).toBeVisible()

    // Close (X link with aria-label "닫기") → back to /timeline
    // 닫기는 이제 <a> 가 아니라 <button> 이다(뷰어 상단바).
    await page.getByRole('button', { name: '닫기' }).first().click()
    await expect(page).toHaveURL(/\/timeline$/)

    // Visit calendar
    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: /캘린더/ })).toBeVisible()

    // 설정 — 제목과 표시 이름이 보인다. (이메일은 이제 선택이라 가입에서 안 넣는다.)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /설정/ })).toBeVisible()
    await expect(page.getByText('Smoke Tester', { exact: true }).first()).toBeVisible()

    // /trash renders (empty state)
    await page.goto('/trash')
    await expect(page.getByRole('heading', { name: /휴지통/ })).toBeVisible()
    await expect(page.getByText(/휴지통이 비어/)).toBeVisible()

    // 단일 가족 모델에서 owner 는 곧 인스턴스 관리자다(§9) — 예전 테스트는 owner 도
    // /admin 에서 404 를 받을 거라 단언했는데, 그건 그 규칙이 생기기 전 이야기다.
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: /관리자/ }).first()).toBeVisible({
      timeout: 15_000,
    })

    // CSRF middleware: cross-origin POST → 403 (Origin cannot be set via
    // browser fetch, so use the APIRequestContext which bypasses that rule).
    const csrfRes = await page.request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example.com' },
      data: { email: 'x@x.test', password: 'x' },
    })
    expect(csrfRes.status()).toBe(403)
  })
})
