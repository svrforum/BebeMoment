import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import sharp from 'sharp'

/**
 * 타임라인에서 사진 한 장을 올린다.
 *
 * 예전엔 window.__uppy 내부를 직접 불렀는데, 그 핸들은 매니저가 초기화된 뒤에만 있고
 * 화면이 바뀌면 조용히 사라진다. 사용자가 하는 대로 — 파일 입력에 넣고 버튼을 누른다.
 * 그러면 mime 보정·스테이징까지 실제 경로가 함께 덮인다.
 */
export async function uploadOnePhoto(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const jpeg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 100, b: 150 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer()
  mkdirSync(testInfo.outputDir, { recursive: true })
  const file = path.join(testInfo.outputDir, name)
  writeFileSync(file, jpeg)

  // FAB → 선택 시트("사진 · 영상 올리기" 행) → 업로드 시트(같은 문구의 heading).
  await page.locator('button[aria-label="추가"], button[aria-label="업로드"]').first().click()
  await page
    .getByRole('button', { name: /사진 · 영상 올리기/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: '사진 · 영상 올리기' })).toBeVisible({
    timeout: 10_000,
  })

  await page.locator('input[type="file"][accept]').first().setInputFiles(file)
  await expect(page.getByRole('button', { name: '크게 보기' }).first()).toBeVisible({
    timeout: 20_000,
  })
  // 바이트가 실제로 올라간 것을 확인하고 나서야 다음으로 넘어간다. 시트를 먼저 닫으면
  // close() 가 clearStaged() 를 불러 아직 시작 안 한 파일이 취소된다 — 그래서 예전엔
  // 업로드가 조용히 사라지고 타임라인이 비어 있었다.
  const uploaded = page.waitForResponse(
    (r) => r.url().includes('/media/v1/tus/') && r.request().method() === 'PATCH' && r.ok(),
    { timeout: 60_000 },
  )
  await page.getByRole('button', { name: /개 업로드/ }).click()
  await uploaded
}

/** 타임라인 그리드에 사진이 나타날 때까지 기다린다(처리 완료까지 시간이 걸린다). */
export async function waitForTimelineThumb(page: Page, tries = 12): Promise<boolean> {
  // Escape 로 닫지 않는다 — 시트의 close() 가 clearStaged() 를 불러 업로드를 취소한다.
  // 페이지 이동만으로 시트는 사라진다.
  for (let i = 0; i < tries; i++) {
    await page.goto('/timeline')
    if ((await page.locator('main a[href^="/detail/"]').count()) >= 1) return true
    await page.waitForTimeout(3_000)
  }
  return false
}
