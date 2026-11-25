import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { IntlErrorCode, createTranslator } from 'next-intl'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'
import { parseSource, sourceFiles, walkNodes } from '../test-support/source-files'

const CATALOGS = { ko, en } as const
const LOCALES = Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]

type Rendered = { text: string } | { error: string }
type Render = (locale: string, key: string, message: string) => Rendered
type FormatMessageModule = {
  default: (key: string, message: string, values: undefined, options: object) => unknown
}
type CoreModule = {
  _createCache: () => object
  _createIntlFormatters: (cache: object) => object
}

/**
 * next-intl 이 쓰는 use-intl 의 한 빌드로 문장 하나를 값 없이 렌더한다. 두 빌드는
 * `dist/esm/{production,development}` 로 나란히 있어, 패키지 진입점(=production)의 옆 폴더를
 * 직접 연다. vitest 는 개발 빌드만 쓰므로 이렇게 해야 프로덕션 동작을 볼 수 있다.
 */
async function loadBuild(build: 'production' | 'development'): Promise<Render> {
  const require = createRequire(import.meta.url)
  const entry = createRequire(require.resolve('next-intl')).resolve('use-intl')
  const dir = path.join(path.dirname(path.dirname(entry)), build)
  const load = async <T>(rel: string): Promise<T> =>
    (await import(pathToFileURL(path.join(dir, rel)).href)) as T
  const core = await load<CoreModule>('core.js')
  const format = (await load<FormatMessageModule>('format-message/index.js')).default
  const cache = core._createCache()
  const formatters = core._createIntlFormatters(cache)
  return (locale, key, message) => {
    try {
      const options = { cache, formatters, locale, timeZone: 'UTC' }
      return { text: String(format(key, message, undefined, options)) }
    } catch (e) {
      return { error: (e as { code?: string }).code ?? String(e) }
    }
  }
}

/** `t.rich('a.b', …)`·`t.markup('a.b', …)` 의 리터럴 키. 앞의 네임스페이스는 호출마다 달라 꼬리만 안다. */
function richKeys(): string[] {
  const keys: string[] = []
  for (const rel of sourceFiles('src', 'app')) {
    walkNodes(parseSource(rel), (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === 'rich' || node.expression.name.text === 'markup') &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      )
        keys.push(node.arguments[0].text)
    })
  }
  return keys
}

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
})

/**
 * 값 없이 부른 문장을 개발 빌드는 `<`·`{` 만 있어도 ICU 로 읽지만, 프로덕션 빌드는 `'{`·`'}` 가
 * 있을 때만 읽고 나머지는 글자 그대로 내보낸다. 그래서 `'<TENANT-ID>'` 처럼 꺾쇠를 작은따옴표로
 * 감싸면 개발·테스트에선 멀쩡하고 운영 화면에만 따옴표가 찍힌다(감싸지 않으면 반대로 개발에서만
 * 깨진다). 글자 그대로의 꺾쇠가 필요하면 값으로 넘긴다(`t('x', { issuer: '<IdP-URL>/…' })`).
 */
describe('개발·프로덕션 빌드에서 같은 문장이 보인다', () => {
  let prod: Render
  let dev: Render
  beforeAll(async () => {
    prod = await loadBuild('production')
    dev = await loadBuild('development')
  })

  it('두 빌드를 따로 읽는다 — 작은따옴표로 감싼 꺾쇠를 서로 다르게 낸다', () => {
    expect(dev('en', 'x', "a '<b>' c")).toEqual({ text: 'a <b> c' })
    expect(prod('en', 'x', "a '<b>' c")).toEqual({ text: "a '<b>' c" })
  })

  it.each(LOCALES)('%s: 값 없이 부르는 문장은 두 빌드에서 똑같다', (locale) => {
    const diverged: string[] = []
    for (const [key, value] of flatten(CATALOGS[locale])) {
      if (typeof value !== 'string') continue
      const inDev = dev(locale, key, value)
      // 인자·태그가 있으면 값과 함께 부르고, 그땐 두 빌드 모두 ICU 로 읽는다. 문법 오류는 위에서 본다.
      if ('error' in inDev) continue
      const inProd = prod(locale, key, value)
      if (!('text' in inProd) || inProd.text !== inDev.text)
        diverged.push(`${key}: ${JSON.stringify(inProd)} ≠ ${JSON.stringify(inDev.text)}`)
    }
    expect(diverged).toEqual([])
  })

  /** `t()` 로 부르면 개발은 키 경로를, 프로덕션은 `<b>` 를 글자 그대로 보여 준다. */
  it('꺾쇠(<)는 t.rich·t.markup 으로 그리는 문장의 태그로만 쓴다', () => {
    const rich = richKeys()
    expect(rich.length).toBeGreaterThan(20)
    const offenders = new Set<string>()
    for (const locale of LOCALES) {
      for (const [key, value] of flatten(CATALOGS[locale])) {
        if (typeof value !== 'string' || !value.includes('<')) continue
        if (!rich.some((r) => key === r || key.endsWith(`.${r}`))) offenders.add(key)
      }
    }
    expect([...offenders]).toEqual([])
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
