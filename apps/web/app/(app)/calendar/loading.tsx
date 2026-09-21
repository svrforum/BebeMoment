/** 실제 캘린더(AppHeader + MonthGrid)와 같은 폭·간격·모서리로 맞춘 자리표시자. */
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
        <div className="mb-5 flex items-center justify-between">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-base-100 dark:bg-base-800" />
          <div className="flex items-center gap-1">
            <div className="h-9 w-9 animate-pulse rounded-full bg-base-100 dark:bg-base-800" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-base-100 dark:bg-base-800" />
          </div>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => `cal-sk-dow-${i}`).map((k) => (
            <div
              key={k}
              className="mx-auto h-3 w-4 animate-pulse rounded bg-base-100 dark:bg-base-800"
            />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => `cal-sk-${i}`).map((k) => (
            <div
              key={k}
              className="aspect-square animate-pulse rounded-2xl bg-base-100 dark:bg-base-800"
            />
          ))}
        </div>
      </div>
    </>
  )
}
