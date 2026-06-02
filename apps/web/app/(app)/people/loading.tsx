export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-30 bg-base-50/80 backdrop-blur-md dark:bg-base-950/80">
        <div className="mx-auto max-w-3xl px-5">
          <div className="flex h-20 items-end pb-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-base-100 dark:bg-base-800" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 px-5 py-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => `ppl-sk-${i}`).map((k) => (
          <div key={k} className="flex flex-col items-center gap-2">
            <div className="aspect-square w-full animate-pulse rounded-full bg-base-100 dark:bg-base-800" />
            <div className="h-3 w-12 animate-pulse rounded bg-base-100 dark:bg-base-800" />
          </div>
        ))}
      </div>
    </>
  )
}
