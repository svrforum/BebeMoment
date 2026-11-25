import { readFileSync } from 'node:fs'
import { SHARE_KINDS, SHARE_KIND_LABEL_KEYS } from '@/lib/share-kind'
import { describe, expect, it } from 'vitest'

/**
 * 공유 시트는 대상 종류마다 `social.share.copy.<kind>.{sheetTitle,intro}` 를, 관리 화면의 링크
 * 목록은 `admin.share.kind.<라벨 키>` 를 **동적 키**로 읽는다. 문구를 빠뜨려도 타입체크는 모르고
 * 화면에 키 경로가 그대로 뜬다 — 일정 공유를 붙일 때 관리 목록에서 실제로 그랬다. 종류 목록의
 * 원본(SHARE_KINDS)을 돌며 두 카탈로그를 본다.
 */
function catalog(locale: string) {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as {
    social: { share: { copy: Record<string, { sheetTitle?: unknown; intro?: unknown }> } }
    admin: { share: { kind: Record<string, unknown> } }
  }
}

describe('공유 종류 문구', () => {
  for (const locale of ['ko', 'en']) {
    it(`${locale}: 모든 공유 대상에 시트 제목과 안내문이 있다`, () => {
      const copy = catalog(locale).social.share.copy
      for (const kind of SHARE_KINDS) {
        expect(typeof copy[kind]?.sheetTitle, `${kind}.sheetTitle`).toBe('string')
        expect(typeof copy[kind]?.intro, `${kind}.intro`).toBe('string')
      }
    })

    it(`${locale}: 관리 화면 링크 목록에 모든 종류의 이름이 있다`, () => {
      const names = catalog(locale).admin.share.kind
      for (const kind of SHARE_KINDS) {
        expect(typeof names[SHARE_KIND_LABEL_KEYS[kind]], `admin.share.kind.${kind}`).toBe('string')
      }
    })
  }
})
