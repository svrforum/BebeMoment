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
    browser,
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

    // 링크만 있고 사진은 401/404 인 상태를 통과시키지 않는다 — 썸네일이 실제로 그려져야 한다.
    // 이미지 파생물은 자산당 서명 하나를 쓰는 짧은 주소로 나간다(발급 → rewrite → media 라우트).
    const loadedPath = (el: HTMLImageElement) =>
      el.complete && el.naturalWidth > 0 ? new URL(el.currentSrc).pathname : ''
    await expect
      .poll(() => page.locator('main a[href^="/detail/"] img').first().evaluate(loadedPath), {
        timeout: 30_000,
      })
      .toMatch(/^\/media\/v1\/img\/[0-9a-f-]{36}\/thumb(256|512)\.(avif|webp|jpeg)\/[^/]+$/)

    // 공개 공유 링크 — 로그인하지 않은 새 창에서도 사진과 미리보기 이미지가 그 주소로 열린다.
    // (공유 화면은 절대 주소를 쓰고, 메신저 크롤러는 og:image 를 쿠키 없이 받는다.)
    const assetId = await page
      .locator('main a[data-asset-id]')
      .first()
      .getAttribute('data-asset-id')
    const { token } = await page.evaluate(async (id) => {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: id, ttl: '1d' }),
      })
      return (await res.json()) as { token: string }
    }, assetId)
    const anon = await browser.newContext({ baseURL: new URL(page.url()).origin })
    const shared = await anon.newPage()
    await shared.goto(`/s/${token}`)
    await expect
      .poll(() => shared.locator('main img, img').first().evaluate(loadedPath), { timeout: 30_000 })
      .toMatch(/^\/media\/v1\/img\/[0-9a-f-]{36}\/display1080\.jpeg\/[^/]+$/)
    const ogImage = await shared.locator('meta[property="og:image"]').getAttribute('content')
    expect(new URL(ogImage as string).pathname).toMatch(
      /^\/media\/v1\/img\/[0-9a-f-]{36}\/display1080\.jpeg\/[^/]+$/,
    )
    const og = await anon.request.get(ogImage as string)
    expect(og.status()).toBe(200)
    expect(og.headers()['content-type']).toBe('image/jpeg')
    await anon.close()

    // 고르는 중의 뒤로가기는 선택만 푼다. 앱의 하드웨어 뒤로가기도 이 히스토리 뒤로가기를
    // 부른다 — 예전엔 타임라인을 떠나거나, 첫 화면이면 앱 종료를 물었다. 선택 중에 연 시트가
    // 있으면 시트가 먼저 닫히고 고른 사진은 남는다.
    const firstCard = page.locator('main a[href^="/detail/"]').first()
    const selectionBar = page.getByText('1장 선택됨')
    await firstCard.click({ modifiers: ['Control'] })
    await expect(selectionBar).toBeVisible()
    await page.goBack()
    await expect(selectionBar).toBeHidden()
    await expect(page).toHaveURL(/\/timeline$/)

    await firstCard.click({ modifiers: ['Control'] })
    await page.getByRole('button', { name: '앨범에 추가', exact: true }).click()
    const albumPicker = page.getByRole('dialog', { name: '앨범에 추가' })
    await expect(albumPicker).toBeVisible()
    await page.goBack()
    await expect(albumPicker).toBeHidden()
    await expect(selectionBar).toBeVisible()
    await page.goBack()
    await expect(selectionBar).toBeHidden()
    await expect(page).toHaveURL(/\/timeline$/)

    // X 로 푼 뒤 다른 탭에 갔다 와서 다시 고른 경우도 같다 — 주소만 보고 남은 사본을 이어받던
    // 방식은 여기서 선택을 푸는 대신 캘린더로 넘어갔다.
    await firstCard.click({ modifiers: ['Control'] })
    await page.getByRole('button', { name: '선택 해제' }).click()
    await page.getByRole('link', { name: '캘린더' }).first().click()
    await expect(page).toHaveURL(/\/calendar$/, { timeout: 30_000 })
    await page.getByRole('link', { name: '타임라인' }).first().click()
    await expect(page).toHaveURL(/\/timeline$/, { timeout: 30_000 })
    await firstCard.click({ modifiers: ['Control'] })
    await expect(selectionBar).toBeVisible()
    await page.goBack()
    await expect(selectionBar).toBeHidden()
    await expect(page).toHaveURL(/\/timeline$/)

    // Click first thumb in a bucket section → detail page
    const detailLink = page.locator('main a[href^="/detail/"]').first()
    const detailHref = await detailLink.getAttribute('href')
    // 타임라인 링크는 컬렉션 컨텍스트를 싣는다(?ctx=timeline) — 뷰어가 그리드와 같은
    // 순서로 스와이프하기 위한 것. 순번 뒤에 쿼리가 붙을 수 있다.
    expect(detailHref).toMatch(/^\/detail\/[0-9a-f-]+(\?|$)/)
    await Promise.all([
      page.waitForURL(/\/detail\/[0-9a-f-]+(\?|$)/, { timeout: 10_000 }),
      detailLink.click(),
    ])

    // Detail page renders side panel heading (P6 UI — filename removed)
    await expect(page.getByRole('heading', { name: '세부정보' })).toBeVisible()
    // 뷰어의 큰 사진도 같은 짧은 주소로 실제로 뜬다.
    await expect
      .poll(() => page.locator('.swiper-slide-active img').first().evaluate(loadedPath), {
        timeout: 30_000,
      })
      .toMatch(/^\/media\/v1\/img\/[0-9a-f-]{36}\/(display1080|thumb512)\.(webp|jpeg)\/[^/]+$/)

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
