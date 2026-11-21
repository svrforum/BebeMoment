import { type Page, expect, test } from '@playwright/test'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'
import { uploadOnePhoto, uploadPhotos, waitForTimelineThumb } from './support/upload'

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
    await page.getByRole('button', { name: '휴지통으로 옮기기', exact: true }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '휴지통으로 옮기기', exact: true }).click()
    await expect(page.getByText(/아직 올라온 사진이 없어요/)).toBeVisible({ timeout: 30_000 })
    await expect(bar(page)).toBeHidden()
  })

  // 타임라인은 사진을 열면 사라졌다가 뒤로가기에 처음부터 다시 만들어진다. 떠날 때의 상태를 그
  // 히스토리 항목 앞으로 기억했다가 되살리지 않으면('components/timeline/resume.ts') 펼쳐 둔 날이
  // 다시 접히고, 첫 페이지 아래에서 보던 자리는 첫 페이지 끝으로 밀린다.
  test('더보기로 펼친 날의 사진을 열었다 돌아오면 펼쳐진 채 그 자리다', async ({
    page,
  }, testInfo) => {
    const uniq = Date.now()
    await page.goto('/')
    await useKorean(page)
    await signUpAsOwner(page, {
      username: `more${uniq}`.slice(0, 24),
      password: 'password123',
      displayName: 'More Tester',
    })
    await completeOnboarding(page, {
      familyName: `More Family ${uniq}`,
      babyName: 'More Baby',
      birthDate: '2026-01-01',
    })
    // 하루에 7장 — 6장까지만 보이고 '사진 1장 더보기'가 붙는다.
    await uploadPhotos(
      page,
      testInfo,
      Array.from({ length: 7 }, (_, i) => `more-${uniq}-${i}.jpg`),
    )
    const more = page.getByRole('button', { name: /사진 1장 더보기/ })
    await expect(async () => {
      await page.goto('/timeline')
      await expect(more).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 60_000 })

    const cards = page.locator('main a[href^="/detail/"]')
    await more.click()
    await expect(cards).toHaveCount(7)
    const last = cards.nth(6)
    await page.evaluate(() => {
      document.body.style.paddingBottom = '3000px'
      const card = document.querySelectorAll('main a[href^="/detail/"]')[6]
      const header = document.querySelector('[data-app-header]')
      if (!card || !header) throw new Error('no card')
      window.scrollBy(
        0,
        card.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 40,
      )
    })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
    // 사진은 등장 애니메이션(지연 + 220ms) 동안 6px 쯤 아래에 그려진다 — 멈춘 뒤의 자리로 잰다.
    // 그사이 그리드도 스크롤 뒤의 자리를 읽어 둔다(다음 프레임).
    const settledY = async () => {
      let prev = Number.NaN
      for (let i = 0; i < 40; i++) {
        const y = (await last.boundingBox())?.y ?? Number.NaN
        if (Math.abs(y - prev) < 0.01) return y
        prev = y
        await page.waitForTimeout(100)
      }
      throw new Error('card never settled')
    }
    const before = await settledY()
    // Playwright 의 click 은 누르기 전에 스스로 스크롤할 수 있다(실제로 맨 위로 올렸다) — 그러면
    // 잰 자리와 떠난 자리가 달라진다. 스크롤을 건드리지 않는 클릭으로 연다.
    await last.evaluate((el: HTMLElement) => el.click())
    await page.waitForURL(/\/detail\//)
    await page.goBack()
    await page.waitForURL(/\/timeline$/)

    await expect(cards).toHaveCount(7)
    await expect(more).toBeHidden()
    expect(Math.abs((await settledY()) - before)).toBeLessThanOrEqual(1)
    // 이 항목의 스크롤 복원 표시는 원래대로 돌아와 있다.
    await expect.poll(() => page.evaluate(() => history.scrollRestoration)).toBe('auto')

    // 탭으로 새로 연 타임라인은 다른 항목이다 — 기억을 받지 않고 접힌 채 처음부터.
    await page.locator('a[href="/calendar"]').filter({ visible: true }).first().click()
    await page.waitForURL(/\/calendar/)
    await page.locator('a[href="/timeline"]').filter({ visible: true }).first().click()
    await page.waitForURL(/\/timeline$/)
    await expect(more).toBeVisible()
    await expect(cards).toHaveCount(6)
  })
})
