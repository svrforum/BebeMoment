import { GenericContainer, Wait } from 'testcontainers'

// MinIO 는 Docker Hub 에 이어 quay.io 이미지까지 막았다(2026-09-25, 401) — 그동안 S3 경로는
// 테스트가 하나도 돌지 않았다. 테스트용 S3 는 S3Mock 으로 띄운다(자격증명은 아무 값이나 받는다).
// barrel(index.ts)에서 재수출하지 말 것 — testcontainers 가 앱 번들로 끌려온다(§17#8).
const IMAGE = 'adobe/s3mock:5.2.3'

export const TEST_S3_CREDENTIALS = { accessKey: 'test', secretKey: 'test', region: 'us-east-1' }

export interface TestS3 {
  endpoint: string
  stop(): Promise<void>
}

export async function startTestS3(): Promise<TestS3> {
  const container = await new GenericContainer(IMAGE)
    .withExposedPorts(9090)
    .withWaitStrategy(Wait.forLogMessage(/Tomcat started on ports/))
    .start()
  return {
    endpoint: `http://${container.getHost()}:${container.getMappedPort(9090)}`,
    stop: async () => {
      await container.stop()
    },
  }
}
