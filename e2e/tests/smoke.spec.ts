import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'

async function makeTestJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 150 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

test.describe('bebe-moment P1+P2 smoke', () => {
  test('signup → onboarding → upload → view asset', async ({ page }, testInfo) => {
    const uniq = Date.now()
    const email = `smoke-${uniq}@test.local`
    const password = 'password123'
    const displayName = 'Smoke Tester'
    const familyName = `Smoke Family ${uniq}`
    const babyName = 'Smoke Baby'
    const birthDate = '2026-01-01'

    // 1) visit root → should redirect to /login
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    // 2) go to /signup
    await page.goto('/signup')
    await page.getByLabel(/^이름$/).fill(displayName)
    await page.getByLabel(/^이메일$/).fill(email)
    await page.getByLabel(/비밀번호/).fill(password)
    await Promise.all([
      page.waitForURL(/\/onboarding$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /가입하기/ }).click(),
    ])

    // 3) onboarding → create family + baby
    await page.locator('input[name="familyName"]').fill(familyName)
    await page.locator('input[name="babyName"]').fill(babyName)
    await page.locator('input[name="birthDate"]').fill(birthDate)
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 }),
      page.getByRole('button', { name: /시작하기/ }).click(),
    ])

    // 4) home displays family name + baby
    await expect(page.getByRole('heading', { name: familyName })).toBeVisible()
    await expect(page.getByText(babyName)).toBeVisible()

    // 5) navigate to upload page
    await page
      .getByRole('link', { name: /업로드/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/upload$/)

    // 6) upload a generated JPEG
    const jpegBuffer = await makeTestJpeg()
    const tmpDir = testInfo.outputDir
    mkdirSync(tmpDir, { recursive: true })
    const jpegPath = path.join(tmpDir, `smoke-${uniq}.jpg`)
    writeFileSync(jpegPath, jpegBuffer)

    // Uppy Dashboard renders a visually-hidden <input type="file">.
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(jpegPath)

    // 7) wait for tus upload creation (POST /api/upload -> 201 Created)
    await page.waitForResponse(
      (res) =>
        res.url().includes('/api/upload') &&
        res.request().method() === 'POST' &&
        res.status() === 201,
      { timeout: 60_000 },
    )

    // 8) navigate to assets list
    await page.goto('/assets')
    await expect(page.locator('main')).toContainText(/타임라인/)

    // Poll reload until a thumbnail <img> appears in main.
    let foundThumb = false
    for (let i = 0; i < 10; i++) {
      await page.reload()
      const imgs = page.locator('main img')
      const count = await imgs.count()
      if (count >= 1) {
        foundThumb = true
        break
      }
      await page.waitForTimeout(3_000)
    }
    expect(foundThumb).toBeTruthy()

    // 9) click the first asset thumbnail → detail
    await page.locator('main a[href^="/assets/"]').first().click()
    await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/)
    await expect(page.locator('h1')).toContainText(/smoke-/)
    await expect(page.getByText(/촬영일/)).toBeVisible()
  })
})
