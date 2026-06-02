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
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-4">
        {Array.from({ length: 3 }, (_, i) => `st-sk-${i}`).map((k) => (
          <div
            key={k}
            className="space-y-3 rounded-3xl border border-base-200 p-4 dark:border-base-800"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-base-100 dark:bg-base-800" />
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-base-100 dark:bg-base-800" />
          </div>
        ))}
      </div>
    </>
  )
}
