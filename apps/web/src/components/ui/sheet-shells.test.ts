import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

const shells = read('src/components/ui/sheet-shells.tsx')
const rootLayout = read('app/layout.tsx')
const scheduleForm = read('src/components/schedule/entry-form-sheet.tsx')

describe('sheets under the soft keyboard', () => {
  // `vh` 는 키보드가 올라와도 줄지 않는다 — 시트 아랫부분이 키보드 뒤로 숨는다.
  it('sizes every sheet with dynamic viewport units', () => {
    expect(shells).not.toMatch(/\[\d+(?:\.\d+)?vh\]/)
  })

  // 이게 빠지면 키보드는 레이아웃 뷰포트를 그대로 둔 채 화면만 덮어, dvh 도 줄지 않는다.
  it('lets the keyboard shrink the layout viewport', () => {
    expect(rootLayout).toMatch(/interactiveWidget:\s*'resizes-content'/)
  })
})

describe('schedule form sheet', () => {
  // 저장이 본문 스크롤의 맨 끝에 있으면 체크리스트가 길어질수록 닿을 수 없다.
  it('pins the save action outside the scrolling body', () => {
    expect(scheduleForm).toMatch(/<Sheet[^>]*\bfill\b/)
    const footer = /const FOOTER_CLASS =\s*'([^']*)'/.exec(scheduleForm)?.[1]
    expect(footer).toBeDefined()
    expect(footer).toContain('shrink-0')
    expect(footer).toContain('env(safe-area-inset-bottom)')
    const body = /const BODY_CLASS =\s*'([^']*)'/.exec(scheduleForm)?.[1]
    expect(body).toBeDefined()
    expect(body).toContain('min-h-0')
    expect(body).toContain('flex-1')
    expect(body).toContain('overflow-y-auto')
    const footerOpens = scheduleForm.indexOf('className={FOOTER_CLASS}')
    expect(footerOpens).toBeGreaterThan(-1)
    expect(scheduleForm.indexOf("t('form.save')")).toBeGreaterThan(footerOpens)
  })
})
