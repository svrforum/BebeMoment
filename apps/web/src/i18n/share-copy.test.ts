import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 공유 시트는 대상 종류마다 `social.share.copy.<kind>.{sheetTitle,intro}` 를 **동적 키**로 읽는다.
 * 그래서 새 종류를 추가하고 문구를 빠뜨려도 타입체크도 다른 가드도 모르고, 시트에 키 경로가
 * 그대로 뜬다 — 일정 공유를 붙일 때 실제로 그랬다. 종류 목록을 여기 적고 두 카탈로그를 본다.
 */
const KINDS = ['story', 'asset', 'album', 'selection', 'date', 'schedule'] as const

function copyOf(locale: string): Record<string, { sheetTitle?: unknown; intro?: unknown }> {
  const json = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
  return json.social.share.copy
}

describe('공유 시트 문구', () => {
  for (const locale of ['ko', 'en']) {
    it(`${locale}: 모든 공유 대상에 제목과 안내문이 있다`, () => {
      const copy = copyOf(locale)
      for (const kind of KINDS) {
        expect(typeof copy[kind]?.sheetTitle, `${kind}.sheetTitle`).toBe('string')
        expect(typeof copy[kind]?.intro, `${kind}.intro`).toBe('string')
      }
    })
  }
})
