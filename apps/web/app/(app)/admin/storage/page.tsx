import { AppHeader } from '@/components/shell/app-header'
import { Card, CardBody } from '@/components/ui/card'
import { parseEnv } from '@bebe/config'

export default function StorageSettingsPage() {
  const env = parseEnv(process.env as Record<string, string | undefined>)
  const mode = env.STORAGE_MODE
  const path = env.STORAGE_PATH
  const s3 = {
    endpoint: env.STORAGE_S3_ENDPOINT,
    bucket: env.STORAGE_S3_BUCKET,
    region: env.STORAGE_S3_REGION,
  }

  return (
    <>
      <AppHeader title="스토리지" subtitle="환경변수로 설정 (읽기 전용)" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-3">
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-2">모드</h2>
            <p className="font-mono text-sm text-point-500">{mode}</p>
          </CardBody>
        </Card>
        {mode === 'local' && (
          <Card>
            <CardBody>
              <h2 className="font-semibold mb-2">로컬 경로</h2>
              <p className="font-mono text-sm">{path}</p>
            </CardBody>
          </Card>
        )}
        {mode === 's3' && (
          <Card>
            <CardBody className="space-y-2">
              <div>
                <div className="text-xs text-base-500">Endpoint</div>
                <div className="font-mono text-sm">{s3.endpoint ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-base-500">Bucket</div>
                <div className="font-mono text-sm">{s3.bucket ?? '-'}</div>
              </div>
              <div>
                <div className="text-xs text-base-500">Region</div>
                <div className="font-mono text-sm">{s3.region}</div>
              </div>
            </CardBody>
          </Card>
        )}
        <p className="text-xs text-base-500 px-2">
          스토리지 설정은 환경변수 (STORAGE_MODE, STORAGE_PATH, STORAGE_S3_*) 로 관리돼요.
          변경하려면 컨테이너 재시작이 필요합니다.
        </p>
      </div>
    </>
  )
}
