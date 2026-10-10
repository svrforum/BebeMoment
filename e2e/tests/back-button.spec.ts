import { type Page, expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'
import { uploadOnePhoto, waitForTimelineThumb } from './support/upload'

/**
 * 시트·사진 선택이 떠 있는 동안의 뒤로가기(`apps/web/src/lib/back-layers.ts`). 앱의 하드웨어
 * 뒤로가기도 같은 히스토리 뒤로가기를 부른다. 기본 흐름은 smoke 가 보고, 여기서는 고치며 드러난
 * 가장자리를 지킨다.
 */
test.describe('뒤로가기와 시트·선택', () => {
  test.beforeEach(async () => {
    await resetDatabase()
  })

  test('스크롤 유지 · 첫 항목 가드 · 삭제 뒤 갱신 · Navigation API 없는 브라우저', async ({
    page,
    browser,
  }, testInfo) => {
    const uniq = Date.now()
    await page.goto('/')
    await useKorean(page)
    await signUpAsOwner(page, {
      username: `back${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'Back Tester',
    })
    await completeOnboarding(page, {
      familyName: `Back Family ${uniq}`,
      babyName: 'Back Baby',
      birthDate: '2026-01-01',
    })
    await uploadOnePhoto(page, testInfo, `back-${uniq}.jpg`)
    expect(await waitForTimelineThumb(page)).toBeTruthy()

    const card = (p: Page) => p.locator('main a[href^="/detail/"]').first()
    const bar = (p: Page) => p.getByText('1장 선택됨')
    const baseURL = testInfo.project.use.baseURL ?? ''
    const storageState = await page.context().storageState()

    // 고르면서 스크롤한 뒤 뒤로가기로 선택을 풀어도 화면이 고르기 시작한 위치로 튀지 않는다.
    await page.evaluate(() => {
      document.body.style.paddingBottom = '4000px'
      window.scrollTo(0, 0)
    })
    await card(page).click({ modifiers: ['Control'] })
    await expect(bar(page)).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 1500))
    await page.goBack()
    await expect(bar(page)).toBeHidden()
    await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('auto')
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000)
    await page.evaluate(() => {
      document.body.style.paddingBottom = ''
    })

    // 앱은 다른 출처의 시작 화면(https://localhost)에서 location.href 로 들어온다. 첫 항목에서
    // 남은 사본을 건너뛰어도 그 시작 화면으로 돌아가 앱이 다시 뜨면 안 된다.
    const appLike = await browser.newContext({ baseURL, storageState, serviceWorkers: 'block' })
    const app = await appLike.newPage()
    await app.goto(`${baseURL.replace('localhost', '127.0.0.1')}/api/health`)
    await Promise.all([
      app.waitForURL(/localhost:\d+\/timeline$/, { timeout: 60_000 }),
      app.evaluate((url) => {
        location.href = url
      }, `${baseURL}/timeline`),
    ])
    await expect(card(app)).toBeVisible({ timeout: 30_000 })
    await app.locator('button[aria-label="추가"], button[aria-label="업로드"]').first().click()
    const chooser = app.getByRole('dialog')
    await expect(chooser).toBeVisible()
    await app.keyboard.press('Escape')
    await expect(chooser).toBeHidden()
    await app.goBack()
    await app.waitForTimeout(1000)
    expect(app.url()).toMatch(/localhost:\d+\/timeline$/)
    await appLike.close()

    // Navigation API 가 없는 브라우저(Safari 26.2·Firefox 147 이전)는 시트만 예전 방식으로 닫힌다.
    // 사진 선택은 묶지 않으므로 고른 사진은 그대로 남는다.
    const legacy = await browser.newContext({ baseURL, storageState, serviceWorkers: 'block' })
    await legacy.addInitScript(() => {
      Object.defineProperty(window, 'navigation', { value: undefined, configurable: true })
    })
    const old = await legacy.newPage()
    await old.goto('/timeline')
    await expect(card(old)).toBeVisible({ timeout: 30_000 })
    await card(old).click({ modifiers: ['Control'] })
    await old.getByRole('button', { name: '앨범에 추가', exact: true }).click()
    const picker = old.getByRole('dialog', { name: '앨범에 추가' })
    await expect(picker).toBeVisible()
    await old.goBack()
    await expect(picker).toBeHidden()
    await expect(bar(old)).toBeVisible()
    await expect(old).toHaveURL(/\/timeline$/)
    await legacy.close()

    // 선택해서 지우면 지운 사진이 바로 사라진다 — 히스토리 사본을 거두는 뒤로가기가 끼면 Next 가
    // 진행 중인 refresh 를 버려 사진이 남았다.
    await card(page).click({ modifiers: ['Control'] })
    await page.getByRole('button', { name: '삭제', exact: true }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '삭제', exact: true }).click()
    await expect(page.getByText(/아직 올라온 사진이 없어요/)).toBeVisible({ timeout: 30_000 })
    await expect(bar(page)).toBeHidden()
  })
})
