import { AssetCard } from './asset-card'

type AssetRow = {
  id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  derivatives?: Record<string, string> | null
}

type Props = {
  label: string
  assets: AssetRow[]
}

export function BucketSection({ label, assets }: Props) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-base-600 dark:text-base-400">
        {label}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {assets.map((a) => {
          const derivs = a.derivatives ?? {}
          const thumb = derivs.thumb_sm ?? derivs.poster
          return <AssetCard key={a.id} id={a.id} thumbKey={thumb} status={a.status} kind={a.kind} />
        })}
      </div>
    </section>
  )
}
