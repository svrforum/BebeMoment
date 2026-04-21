import { Card, CardBody } from '@/components/ui/card'

type Props = {
  status: string
  sizeBytes: bigint | number
  width?: number | null
  height?: number | null
  takenAt: Date
  takenAtSource: string
  cameraMake?: string | null
  cameraModel?: string | null
}

function formatSize(b: bigint | number): string {
  const n = typeof b === 'bigint' ? Number(b) : b
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function InfoPanel(p: Props) {
  return (
    <Card className="mx-auto max-w-3xl">
      <CardBody>
        <h2 className="text-sm font-semibold mb-3 text-base-600 dark:text-base-400">정보</h2>
        <dl className="text-sm grid grid-cols-[80px_1fr] gap-y-2 gap-x-3 tabular-nums">
          <dt className="text-base-500">상태</dt>
          <dd>{p.status}</dd>
          <dt className="text-base-500">촬영일</dt>
          <dd>{p.takenAt.toLocaleString('ko-KR')}</dd>
          <dt className="text-base-500">소스</dt>
          <dd>{p.takenAtSource}</dd>
          <dt className="text-base-500">크기</dt>
          <dd>{formatSize(p.sizeBytes)}</dd>
          {p.width && (
            <>
              <dt className="text-base-500">해상도</dt>
              <dd>
                {p.width} × {p.height}
              </dd>
            </>
          )}
          {p.cameraMake && (
            <>
              <dt className="text-base-500">카메라</dt>
              <dd>
                {p.cameraMake} {p.cameraModel}
              </dd>
            </>
          )}
        </dl>
      </CardBody>
    </Card>
  )
}
