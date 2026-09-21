/** 상위 `/calendar` 스켈레톤은 월 그리드 모양이라 할 일 화면에서 엉뚱하게 보인다. */
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-30">
        <div className="mx-auto max-w-3xl px-5">
          <div className="flex min-h-12 items-center pb-3 pt-[calc(env(safe-area-inset-top)+35px)]">
            <div className="h-7 w-24 animate-pulse rounded-lg bg-base-100 dark:bg-base-800" />
          </div>
        </div>
      </div>
      <div className="mx-auto min-h-[68svh] max-w-md px-5 py-4 sm:max-w-lg md:max-w-xl">
        <div className="mb-4 h-11 w-40 animate-pulse rounded-xl bg-base-100 dark:bg-base-800" />
        <div className="mb-2 h-4 w-16 animate-pulse rounded bg-base-100 dark:bg-base-800" />
        <div className="space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => `todo-sk-${i}`).map((k) => (
            <div key={k} className="h-16 animate-pulse rounded-2xl bg-base-100 dark:bg-base-800" />
          ))}
        </div>
      </div>
    </>
  )
}
