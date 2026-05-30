import type { ReactNode } from 'react'

export type SnsBrand = {
  key: 'naver' | 'kakao' | 'google' | 'generic'
  bg: string
  fg: string
  border?: string
  icon: ReactNode
}

// 공급자 이름으로 브랜드 추론(네이버/카카오/구글). 관리자가 임의 이름을 줄 수 있어
// 한/영 키워드 모두 본다. 못 맞히면 generic(중립 회색).
export function getSnsBrand(name: string): SnsBrand {
  const n = name.toLowerCase()
  if (n.includes('naver') || name.includes('네이버')) {
    return {
      key: 'naver',
      bg: '#03C75A',
      fg: '#ffffff',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          role="img"
          aria-label="네이버"
          fill="currentColor"
        >
          <title>네이버</title>
          <path d="M16.27 12.84 7.84 0H0v24h7.73V11.16L16.16 24H24V0h-7.73v12.84Z" />
        </svg>
      ),
    }
  }
  if (n.includes('kakao') || name.includes('카카오')) {
    return {
      key: 'kakao',
      bg: '#FEE500',
      fg: '#191919',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          role="img"
          aria-label="카카오"
          fill="currentColor"
        >
          <title>카카오</title>
          <path d="M12 3C6.48 3 2 6.48 2 10.77c0 2.77 1.85 5.2 4.63 6.57-.2.74-.74 2.7-.84 3.12-.13.52.19.51.4.37.16-.11 2.6-1.77 3.66-2.49.7.1 1.42.16 2.15.16 5.52 0 10-3.48 10-7.73S17.52 3 12 3Z" />
        </svg>
      ),
    }
  }
  if (n.includes('google') || name.includes('구글')) {
    return {
      key: 'google',
      bg: '#ffffff',
      fg: '#3c4043',
      border: '#dadce0',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" role="img" aria-label="Google">
          <title>Google</title>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
          />
        </svg>
      ),
    }
  }
  return {
    key: 'generic',
    bg: 'var(--sns-generic-bg, #f4f4f5)',
    fg: 'inherit',
    icon: null,
  }
}

export function SnsButton({
  href,
  name,
  suffix = '',
}: {
  href: string
  name: string
  /** 닉네임 등 링크 뒤에 붙일 쿼리 — `&name=...`. */
  suffix?: string
}) {
  const brand = getSnsBrand(name)
  return (
    <a
      href={`${href}${suffix}`}
      style={{ backgroundColor: brand.bg, color: brand.fg, borderColor: brand.border }}
      className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold ${
        brand.border ? 'border' : ''
      } ${brand.key === 'generic' ? 'text-base-900 dark:bg-base-800 dark:text-base-50' : ''}`}
    >
      {brand.icon}
      <span>{name}</span>
    </a>
  )
}
