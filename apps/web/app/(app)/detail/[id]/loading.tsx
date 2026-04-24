export default function Loading() {
  return (
    <div className="min-h-screen bg-black md:flex">
      <div className="flex min-h-screen flex-1 items-center justify-center">
        <div className="h-[60vh] w-[80vw] max-w-[640px] animate-pulse rounded-2xl bg-base-900" />
      </div>
      <aside className="hidden w-[360px] shrink-0 space-y-4 overflow-y-auto border-l border-base-800 bg-base-950 p-4 md:block">
        <div className="h-6 w-32 animate-pulse rounded-lg bg-base-800" />
        <div className="space-y-2">
          {[72, 44, 56, 40].map((h, i) => (
            <div
              key={`sk-${i}`}
              style={{ height: h }}
              className="animate-pulse rounded-xl bg-base-800"
            />
          ))}
        </div>
      </aside>
    </div>
  )
}
