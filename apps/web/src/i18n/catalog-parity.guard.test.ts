import { IntlErrorCode, createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'

const CATALOGS = { ko, en } as const

type Leaf = string | unknown[]

function flatten(node: Record<string, unknown>, prefix = ''): Map<string, Leaf> {
  const out = new Map<string, Leaf>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Record<string, unknown>, path)) out.set(k, v)
    } else {
      out.set(path, value as Leaf)
    }
  }
  return out
}

const BRANCHING = new Set(['plural', 'select', 'selectordinal'])

/**
 * ICU 메시지의 인자 이름(`{count}`·`{count, plural, …}`·`{when, date, long}`).
 * plural/select 의 갈래 본문(`one {# photo}`)은 인자가 아니라 다시 메시지로 읽는다.
 * 작은따옴표는 ICU 규칙대로 `'{…'`·`'<…'` 를 글자로, `''` 를 따옴표 하나로 본다.
 */
function icuArgNames(message: string): Set<string> {
  const names = new Set<string>()
  let i = 0
  const skipSpace = (): void => {
    while (i < message.length && /\s/.test(message[i] as string)) i += 1
  }
  const readToken = (stop: RegExp): string => {
    const start = i
    while (i < message.length && !stop.test(message[i] as string)) i += 1
    return message.slice(start, i).trim()
  }
  const body = (): void => {
    while (i < message.length) {
      const c = message[i]
      if (c === "'") {
        const next = message[i + 1]
        if (next === "'") i += 2
        else if (next !== undefined && '{}<>#'.includes(next)) {
          const close = message.indexOf("'", i + 1)
          i = close < 0 ? message.length : close + 1
        } else i += 1
      } else if (c === '{') {
        i += 1
        argument()
      } else if (c === '}') {
        return
      } else i += 1
    }
  }
  const argument = (): void => {
    names.add(readToken(/[,}]/))
    if (message[i] === '}') {
      i += 1
      return
    }
    i += 1
    const type = readToken(/[,}]/)
    if (message[i] === '}') {
      i += 1
      return
    }
    i += 1
    if (!BRANCHING.has(type)) {
      for (let depth = 1; depth > 0 && i < message.length; i += 1) {
        if (message[i] === '{') depth += 1
        else if (message[i] === '}') depth -= 1
      }
      return
    }
    for (;;) {
      skipSpace()
      if (i >= message.length) return
      if (message[i] === '}') {
        i += 1
        return
      }
      readToken(/[\s{]/)
      skipSpace()
      if (message[i] === '{') {
        i += 1
        body()
        i += 1
      }
    }
  }
  body()
  return names
}

/**
 * 두 카탈로그는 같은 키를 같은 모양으로 가져야 한다. 한쪽에만 키를 넣으면 다른 로케일의 화면에
 * 키 경로가 그대로 뜨고, 인자 이름이 어긋나면 그 로케일에서만 값이 빠진 문장이 나간다.
 * 타입체크는 이걸 모른다(메시지 타입 증강이 없다).
 */
describe('ko·en 카탈로그 패리티', () => {
  const ko = flatten(CATALOGS.ko)
  const en = flatten(CATALOGS.en)

  it('같은 키 경로를 가진다', () => {
    const onlyKo = [...ko.keys()].filter((k) => !en.has(k))
    const onlyEn = [...en.keys()].filter((k) => !ko.has(k))
    expect({ onlyKo, onlyEn }).toEqual({ onlyKo: [], onlyEn: [] })
  })

  it('같은 키는 같은 종류의 값이다(문장 / 같은 길이의 목록)', () => {
    const mismatched = [...ko].filter(([key, value]) => {
      const other = en.get(key)
      if (other === undefined) return false
      if (Array.isArray(value) || Array.isArray(other))
        return !Array.isArray(value) || !Array.isArray(other) || value.length !== other.length
      return typeof value !== typeof other
    })
    expect(mismatched.map(([key]) => key)).toEqual([])
  })

  it('같은 키는 같은 ICU 인자를 쓴다', () => {
    const mismatched: string[] = []
    for (const [key, value] of ko) {
      const other = en.get(key)
      if (typeof value !== 'string' || typeof other !== 'string') continue
      const a = [...icuArgNames(value)].sort().join(',')
      const b = [...icuArgNames(other)].sort().join(',')
      if (a !== b) mismatched.push(`${key}: ko{${a}} en{${b}}`)
    }
    expect(mismatched).toEqual([])
  })

  /**
   * 메시지 문법이 깨지면 next-intl 은 문장 대신 키 경로를 보여 준다(콘솔 에러만 남는다).
   * 글자 그대로의 중괄호는 `'{'` 처럼 작은따옴표로 감싸야 한다.
   */
  it.each(Object.keys(CATALOGS) as (keyof typeof CATALOGS)[])(
    '%s 의 모든 문장이 ICU 문법으로 읽힌다',
    (locale) => {
      const invalid: string[] = []
      const t = createTranslator({
        locale,
        messages: CATALOGS[locale],
        timeZone: 'UTC',
        onError: (error) => {
          if (error.code === IntlErrorCode.INVALID_MESSAGE) invalid.push(error.message)
        },
      }) as unknown as (key: string) => string
      for (const [key, value] of flatten(CATALOGS[locale])) if (typeof value === 'string') t(key)
      expect(invalid).toEqual([])
    },
  )

  it('작은따옴표로 감싼 기호는 따옴표 없이 글자 그대로 보인다', () => {
    const t = createTranslator({ locale: 'en', messages: CATALOGS.en, namespace: 'admin' })
    expect(t('auth.microsoftStep6Body')).toContain('/<TENANT-ID>/v2.0')
    expect(t('notifications.serviceAccountPlaceholder')).toContain('(e.g. { "project_id"')
  })
})

describe('icuArgNames', () => {
  it('단순 인자와 형식 인자', () => {
    expect([...icuArgNames('{name} 님, {when, date, long}')]).toEqual(['name', 'when'])
  })
  it('plural 갈래 본문은 인자가 아니다', () => {
    expect([...icuArgNames('{count, plural, =0 {none} one {# photo} other {# {kind}}}')]).toEqual([
      'count',
      'kind',
    ])
  })
  it('작은따옴표로 감싼 중괄호는 글자다', () => {
    expect([...icuArgNames('예: \'{ "a": 1 }\' {x}')]).toEqual(['x'])
    expect([...icuArgNames("don't {x}")]).toEqual(['x'])
  })
})
