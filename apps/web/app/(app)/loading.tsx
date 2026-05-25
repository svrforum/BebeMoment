export default function Loading() {
  return (
    <>
      {/* Header skeleton — matches AppHeader h-20 */}
      <div className="sticky top-0 z-30 border-b border-transparent bg-base-50/80 backdrop-blur-md dark:bg-base-950/80">
        <div className="mx-auto max-w-3xl px-5">
          <div className="flex h-20 items-end pb-2">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-base-100 dark:bg-base-800" />
          </div>
        </div>
      </div>
      {/* Body skeleton */}
      <div className="mx-auto max-w-3xl space-y-3 px-5 py-4">
        {[56, 96, 72, 120, 80].map((h) => (
          <div
            key={`sk-${h}`}
            style={{ height: h }}
            className="animate-pulse rounded-2xl bg-base-100 dark:bg-base-800"
          />
        ))}
      </div>
    </>
  )
}
