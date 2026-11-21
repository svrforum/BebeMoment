import { prismaPublic } from '@/lib/db-init'
import { ThemeProvider } from '@/lib/theme'
import { type DefaultTheme, buildThemeInitScript } from '@/lib/theme-init-script'
import { getSetting } from '@/server/settings/get'
import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { headers } from 'next/headers'
import { preload } from 'react-dom'
import { z } from 'zod'
import './globals.css'

// 92개 서브셋 중 첫 화면이 거의 항상 쓰는 둘만 미리 받는다 — 91 은 기본 라틴 + 가장 흔한
// 한글 음절, 90 은 그다음으로 흔한 음절. 나머지는 CSS 의 unicode-range 가 필요할 때 부른다.
const PRELOADED_FONT_SUBSETS = [91, 90] as const

export const metadata: Metadata = {
  title: 'Bebe Moment',
  description: '우리 아기의 모든 순간',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Bebe Moment',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

// maximum-scale=1 은 애플 기기에만 준다. iOS 는 손가락 확대에는 이 값을 무시하고(늘 확대된다)
// 16px 보다 작은 입력칸을 누를 때 화면이 저절로 커지는 것만 막아 준다. 안드로이드 Chrome·WebView
// 는 이 값을 지켜 확대 자체를 막아 버려서, 작은 글씨를 키워 볼 수 없었다(WCAG 1.4.4).
// (iPadOS 는 데스크톱 UA 를 보내 Macintosh 로 들어온다 — 데스크톱 브라우저는 viewport 를 무시.)
const APPLE_UA = /iPhone|iPad|iPod|Macintosh/

export async function generateViewport(): Promise<Viewport> {
  const ua = (await headers()).get('user-agent') ?? ''
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: '#ffffff' },
      { media: '(prefers-color-scheme: dark)', color: '#09090b' },
    ],
    width: 'device-width',
    initialScale: 1,
    ...(APPLE_UA.test(ua) ? { maximumScale: 1 } : {}),
    viewportFit: 'cover',
    // 키보드가 화면을 덮는 게 아니라 레이아웃 뷰포트를 줄이게 한다. 기본값(resizes-visual)에선
    // vh·dvh 가 그대로라 하단 고정 시트의 아랫부분이 키보드 뒤로 숨고, 저장 버튼에 닿을 수 없다.
    interactiveWidget: 'resizes-content',
  }
}

async function readDefaultTheme(): Promise<DefaultTheme> {
  try {
    return await getSetting(
      'appearance.default_theme',
      z.enum(['auto', 'light', 'dark']),
      'light',
      prismaPublic,
    )
  } catch {
    // DB unavailable (e.g. build-time static prerender) — light mode default.
    return 'light'
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const defaultTheme = await readDefaultTheme()
  const locale = await getLocale()
  const messages = await getMessages()
  for (const n of PRELOADED_FONT_SUBSETS) {
    preload(`/fonts/pretendard/PretendardVariable.subset.${n}.woff2`, {
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    })
  }
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <script>{buildThemeInitScript(defaultTheme)}</script>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider defaultMode={defaultTheme}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
