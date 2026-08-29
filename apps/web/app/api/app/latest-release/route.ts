import { getAuth } from '@/lib/auth'
import { errorJsonKey } from '@/lib/error-response'
import { latestAndroidRelease } from '@/server/app-release/latest'
import { NextResponse } from 'next/server'

/** 설정의 "업데이트 확인"·다운로드 버튼이 쓰는 조회. 조회 자체는 공용 모듈에 있다. */
export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const fresh = new URL(req.url).searchParams.get('fresh') === '1'
  try {
    return NextResponse.json({ release: await latestAndroidRelease({ fresh }) })
  } catch {
    return NextResponse.json({ release: null }, { status: 502 })
  }
}
