import type { ReactNode } from 'react'

// 앱 딥링크 — 설치돼 있으면 앱(bebe://open)으로, 아니면 web 으로 폴백(intent://).
export function appDeepLink(base: string, path: string, webUrl: string): string {
  return `intent://open?server=${encodeURIComponent(base)}&path=${encodeURIComponent(
    path,
  )}#Intent;scheme=bebe;package=im.bebe.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`
}

export function GoneCard({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-base-50 px-6 text-center dark:bg-base-950">
      <p className="text-[17px] font-bold text-base-900 dark:text-base-50">{title}</p>
      <p className="max-w-xs text-[14px] leading-relaxed text-base-500">{body}</p>
    </main>
  )
}

export function ShareShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-base-50 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.25rem)] dark:bg-base-950">
      {children}
    </main>
  )
}

export function ShareHeader({ familyName, meta }: { familyName: string; meta: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-point-100 text-[15px] font-bold text-point-600 dark:bg-point-500/20 dark:text-point-300">
        {familyName.slice(0, 1)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-bold tracking-tight text-base-900 dark:text-base-50">
          {familyName}
        </p>
        <p className="text-[12px] text-base-500">{meta}</p>
      </div>
    </div>
  )
}

export function ShareViewFrame({
  familyName,
  meta,
  appHref,
  webUrl,
  appLabel = '앱에서 이어보기',
  webLabel = '로그인하고 전체 보기',
  children,
}: {
  familyName: string
  meta: string
  appHref: string
  webUrl: string
  appLabel?: string
  webLabel?: string
  children: ReactNode
}) {
  return (
    <ShareShell>
      <ShareHeader familyName={familyName} meta={meta} />

      {children}

      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        <a
          href={appHref}
          className="flex h-12 items-center justify-center rounded-2xl bg-point-500 text-[15px] font-semibold text-white active:scale-[0.99]"
        >
          {appLabel}
        </a>
        <a
          href={webUrl}
          className="flex h-12 items-center justify-center rounded-2xl border border-base-200 bg-base-0 text-[15px] font-semibold text-base-800 active:scale-[0.99] dark:border-base-800 dark:bg-base-900 dark:text-base-100"
        >
          {webLabel}
        </a>
        <p className="mt-1 text-center text-[12px] text-base-400">
          가족 구성원만 전체를 볼 수 있어요
        </p>
      </div>
    </ShareShell>
  )
}
