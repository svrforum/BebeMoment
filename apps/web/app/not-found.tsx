import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-medium text-base-500">404</p>
      <h1 className="mt-3 text-[32px] font-bold tracking-tight">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-base text-base-500">주소를 다시 확인해주세요.</p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-2xl bg-point-500 px-6 font-semibold text-white shadow-[0_6px_20px_-6px] shadow-point-500/45 transition hover:bg-point-600"
      >
        홈으로
      </Link>
    </main>
  )
}
