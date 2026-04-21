'use client'

type Props = {
  kind: 'image' | 'video'
  posterUrl: string | undefined
  mediaUrl: string
  originalFilename: string
}

export function AssetViewer({ kind, posterUrl, mediaUrl, originalFilename }: Props) {
  if (kind === 'video') {
    return (
      <video
        src={mediaUrl}
        poster={posterUrl}
        controls
        style={{ width: '100%', background: '#000', borderRadius: 12 }}
      >
        <track kind="captions" />
      </video>
    )
  }
  return <img src={mediaUrl} alt={originalFilename} style={{ width: '100%', borderRadius: 12 }} />
}
