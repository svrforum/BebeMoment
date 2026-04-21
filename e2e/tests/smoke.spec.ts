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

test.describe('bebe-moment P1+P2+P3 smoke', () => {
  test('signup → onboarding → upload via FAB → timeline thumb → detail', async ({
    page,
  }, testInfo) => {
    const uniq = Date.now()
    const email = `smoke-${uniq}@test.local`
    const password = 'password123'
    const displayName = 'Smoke Tester'
    const familyName = `Smoke Family ${uniq}`
    const babyName = 'Smoke Baby'
    const birthDate = '2026-01-01'

    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/signup')
    await page.locator('input#displayName').fill(displayName)
    await page.locator('input#email').fill(email)
    await page.locator('input#password').fill(password)
    await Promise.all([
      page.waitForURL(/\/onboarding$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /가입하기/ }).click(),
    ])

    await page.locator('input#familyName').fill(familyName)
    await page.locator('input#babyName').fill(babyName)
    await page.locator('input#birthDate').fill(birthDate)
    await Promise.all([
      page.waitForURL(/\/timeline$/, { timeout: 15_000 }),
      page.getByRole('button', { name: /시작하기/ }).click(),
    ])

    // Timeline with family name as heading
    await expect(page.getByRole('heading', { name: familyName })).toBeVisible()
    // Empty state message
    await expect(page.getByText(/업로드 버튼을/)).toBeVisible()

    // Open upload sheet via FAB
    const fab = page.locator('button[aria-label="업로드"]').first()
    await fab.click()
    await expect(page.getByText(/사진 · 영상 올리기/)).toBeVisible({ timeout: 5_000 })

    // Upload JPEG via Uppy. We access the Uppy instance (exposed on
    // window.__uppy in non-production) and call addFile directly — the
    // Dashboard's file input is created transiently inside a <form>
    // element, so Playwright's setInputFiles path is fragile.
    const jpegBuffer = await makeTestJpeg()
    const tmpDir = testInfo.outputDir
    mkdirSync(tmpDir, { recursive: true })
    const jpegPath = path.join(tmpDir, `smoke-${uniq}.jpg`)
    writeFileSync(jpegPath, jpegBuffer)
    const uploadResult = await page.evaluate(
      async ({ bytes, name }) => {
        type UppyHandle = {
          addFile: (f: { name: string; type: string; data: Blob }) => unknown
          upload: () => Promise<{
            successful: { uploadURL?: string }[]
            failed: { error?: unknown }[]
          }>
        }
        const uppy = (window as unknown as { __uppy?: UppyHandle }).__uppy
        if (!uppy) throw new Error('window.__uppy not found')
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
        uppy.addFile({ name, type: 'image/jpeg', data: blob })
        const result = await uppy.upload()
        return {
          successful: result?.successful?.length ?? 0,
          failed: result?.failed?.length ?? 0,
        }
      },
      { bytes: Array.from(jpegBuffer), name: `smoke-${uniq}.jpg` },
    )
    expect(uploadResult.failed).toBe(0)
    expect(uploadResult.successful).toBe(1)

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

    // Detail page shows filename
    await expect(page.getByText(/smoke-/)).toBeVisible()

    // Close (X button with aria-label "닫기") → back to /timeline
    await page.getByLabel(/닫기/).click()
    await expect(page).toHaveURL(/\/timeline$/)

    // Visit calendar
    await page.goto('/calendar')
    await expect(page.getByRole('heading', { name: /캘린더/ })).toBeVisible()

    // Visit settings
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: /설정/ })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  })
})
