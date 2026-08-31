import { requireAdmin } from '@/lib/require-admin'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 얼굴 인식 사이드카가 실제로 닿는지 확인한다.
 *
 * `features.faces` 는 켜기만 하면 되는데, ml 컨테이너는 compose 의 `faces` 프로필 뒤에 있어
 * 기본으로는 없다. 그러면 업로드마다 잡이 쌓이고 DNS 실패로 조용히 3번 재시도 후 버려진다 —
 * 관리자 화면은 기능이 켜졌다고만 말하고, 사진에는 얼굴이 영영 안 잡힌다. 켜기 전에·켠 뒤에
 * 여기서 확인할 수 있게 한다.
 */
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx
  const url = process.env.FACE_ML_URL ?? 'http://ml:8000'
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return NextResponse.json({ url, reachable: res.ok, status: res.status })
  } catch (e) {
    // 닿지 않는 것은 에러가 아니라 상태다 — 화면이 그대로 보여줘야 한다.
    return NextResponse.json({ url, reachable: false, error: (e as Error).message.slice(0, 200) })
  }
}
