import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { completeOnboarding, resetDatabase, signUpAsOwner, useKorean } from './support/flows'

async function makeTestJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 150 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

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

    // FAB → 선택 시트("사진·영상" / "파일에서 선택") → 업로드 시트.
    // 예전엔 FAB 이 곧바로 OS 선택기를 열었는데, 그러면 '파일에서 선택'이 어디에도
    // 보이지 않아 존재를 알 수 없었다(v0.0.85).
    await page.locator('button[aria-label="추가"], button[aria-label="업로드"]').first().click()
    // 선택 시트의 행(button)과 업로드 시트의 제목(heading)이 같은 문구라 역할로 구분한다.
    await page
      .getByRole('button', { name: /사진 · 영상 올리기/ })
      .first()
      .click()
    await expect(page.getByRole('heading', { name: '사진 · 영상 올리기' })).toBeVisible({
      timeout: 5_000,
    })

    // 실제 파일 입력으로 올린다 — 예전엔 window.__uppy 내부를 직접 불렀는데, 그 핸들은
    // 매니저가 초기화된 뒤에만 있고 화면이 바뀌면 조용히 사라진다. 입력에 파일을 넣고
    // 사용자가 누르는 버튼을 누르는 쪽이 실제 경로(mime 보정·스테이징)까지 함께 덮는다.
    const jpegBuffer = await makeTestJpeg()
    const tmpDir = testInfo.outputDir
    mkdirSync(tmpDir, { recursive: true })
    const jpegPath = path.join(tmpDir, `smoke-${uniq}.jpg`)
    writeFileSync(jpegPath, jpegBuffer)

    await page.locator('input[type="file"][accept]').first().setInputFiles(jpegPath)
    // 스테이징 썸네일이 뜨면 준비된 것.
    await expect(page.getByRole('button', { name: '크게 보기' }).first()).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /개 업로드/ }).click()

    // Close the sheet with Escape and go to /timeline
    await page.keyboard.press('Escape')
    await page.goto('/timeline')

    // Poll for thumbnail to appear
    let foundThumb = false
    for (let i = 0; i < 10; i++) {
      await page.reload()
      if ((await page.locator('main img').count()) >= 1) {
        foundThumb = true
        break
      }
      await page.waitForTimeout(3_000)
    }
    expect(foundThumb).toBeTruthy()

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
    await page.getByRole('link', { name: '닫기' }).click()
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

    // Non-admin user hitting /admin → notFound() 404 page
    const adminResponse = await page.goto('/admin')
    expect(adminResponse?.status()).toBe(404)

    // CSRF middleware: cross-origin POST → 403 (Origin cannot be set via
    // browser fetch, so use the APIRequestContext which bypasses that rule).
    const csrfRes = await page.request.post('/api/auth/login', {
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example.com' },
      data: { email: 'x@x.test', password: 'x' },
    })
    expect(csrfRes.status()).toBe(403)
  })
})
