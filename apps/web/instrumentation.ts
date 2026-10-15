// Next.js 가 서버 부팅 시 1회 실행(Node 런타임). env 를 즉시 검증해, 잘못 설정됐거나
// 약한/자리표시자 시크릿으로 띄운 배포가 — 공개된 시크릿으로 서빙하거나 나중에 미디어
// 페이지에서 조용히 500 나기 전에 — 부팅 단계에서 시끄럽게 실패하게 한다. process.exit 는
// Edge 미지원이라 검증 로직은 nodejs 분기에서만 동적 import 한다(Edge 번들 경고 방지).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { validateEnvAtBoot } = await import('./src/lib/validate-env-boot')
  validateEnvAtBoot()
  // 열린 SSE 응답이 서버 종료를 붙잡지 않게 시그널을 미리 듣는다. 빌드(phase-production-build)
  // 에서는 Next 가 register() 를 부르지 않아 빌드 워커에는 리스너가 붙지 않는다.
  const { listenForServerShutdown } = await import('./src/server/upload/sse-shutdown')
  listenForServerShutdown()
}
