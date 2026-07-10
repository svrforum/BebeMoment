import { NextResponse } from 'next/server'

/**
 * Prisma BigInt 컬럼(대표적으로 `asset.sizeBytes`)을 담은 응답을 JSON 으로 내보낼 때
 * 쓰는 헬퍼. `NextResponse.json` 은 내부적으로 `JSON.stringify` 를 부르는데, 이건 BigInt
 * 를 만나면 `TypeError: Do not know how to serialize a BigInt` 로 던져 **빈 500** 을 낸다
 * (스토리 목록/상세가 실제로 이 버그로 500 났다). BigInt→Number 는 파일 크기(< 2^53)에
 * 안전하고, 클라(`viewer-shell` 의 `BigInt(meta.n)`, `metadata-section` 의 `bigint | number`)
 * 와도 호환된다. AssetWithUrls 를 담은 API 응답은 전부 이 헬퍼로 내보낼 것.
 */
export function serializeBig(data: unknown): string {
  return JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? Number(value) : value))
}

export function jsonBig(data: unknown, init?: ResponseInit): NextResponse {
  return new NextResponse(serializeBig(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}
