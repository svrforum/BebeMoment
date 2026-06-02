export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-30 bg-base-50/80 backdrop-blur-md dark:bg-base-950/80">
        <div className="mx-auto max-w-3xl px-5">
          <div className="flex h-20 items-end pb-2">
            <div className="h-8 w-28 animate-pulse rounded-lg bg-base-100 dark:bg-base-800" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-7 gap-1.5 px-5 py-4 sm:max-w-lg md:max-w-xl">
        {Array.from({ length: 35 }, (_, i) => `cal-sk-${i}`).map((k) => (
          <div
            key={k}
            className="aspect-square animate-pulse rounded-lg bg-base-100 dark:bg-base-800"
          />
        ))}
      </div>
    </>
  )
}
