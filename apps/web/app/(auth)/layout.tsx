import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-base-50 dark:bg-base-950 md:grid md:grid-cols-[1.15fr_1fr] lg:grid-cols-[1.3fr_1fr]">
      {/* Brand hero — desktop only */}
      <aside className="relative hidden overflow-hidden md:block">
        {/* Ambient gradients */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_900px_600px_at_20%_20%,oklch(0.75_0.2_245/.35),transparent_65%),radial-gradient(ellipse_800px_600px_at_85%_85%,oklch(0.82_0.14_330/.25),transparent_60%),radial-gradient(ellipse_500px_400px_at_90%_10%,oklch(0.88_0.15_85/.18),transparent_70%)]"
        />
        {/* Subtle grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:32px_32px]"
        />
        {/* Content */}
        <div className="relative flex h-full min-h-[100dvh] flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-point-500 text-sm font-bold text-white shadow-lg shadow-point-500/40">
              b
            </span>
            <span className="text-base-900 dark:text-base-50">
              bebe<span className="text-point-500">·</span>moment
            </span>
          </div>
          <div className="max-w-xl">
            <h2 className="text-balance font-bold leading-[1.05] tracking-tight text-base-900 dark:text-base-50 text-[clamp(2.5rem,4.2vw,4.25rem)]">
              우리 아기의
              <br />
              <span className="bg-gradient-to-br from-point-500 to-[oklch(0.72_0.2_330)] bg-clip-text text-transparent">
                모든 순간
              </span>
              을,
              <br />
              가족과 함께.
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-base-600 dark:text-base-400">
              사진 · 영상 · 성장 · 마일스톤 · 스토리를 한 곳에.
              <br />
              원본 그대로 안전하게 보관하고, 가족과 실시간으로 나눠요.
            </p>
          </div>
          <p className="text-xs text-base-500">Self-hosted · 오픈소스 · 가족 단위 격리</p>
        </div>
      </aside>

      {/* Form side */}
      <section className="relative flex min-h-[100dvh] items-stretch md:items-center md:justify-center md:bg-base-0 dark:md:bg-base-900">
        <div className="w-full md:max-w-[520px] md:px-12 md:py-16 xl:px-16">{children}</div>
      </section>
    </div>
  )
}
