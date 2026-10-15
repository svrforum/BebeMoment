/**
 * 서버(web 프로세스)가 내려갈 때 열린 SSE 스트림을 끝낸다.
 *
 * 왜: Next 는 SIGTERM·SIGINT 를 받으면 server.close() 가 끝나기를 기다렸다가 종료하고, Node 는
 * 응답 중인 연결이 끝날 때까지 기다린다. SSE 응답은 스스로 끝나지 않아, 앱을 열어 둔 가족이
 * 한 명이라도 있으면 web 이 run-app.sh 의 종료 유예(45초)를 다 쓰고 강제 종료됐다. 스트림을 끝내면
 * 응답이 정상 종료되고, EventSource 는 새 서버로 다시 붙는다.
 *
 * 리스너는 서버가 부팅할 때(instrumentation.ts) 달고, 그 전에 스트림이 열리면 그때 단다. 모듈을
 * 불러오기만 해서는 달지 않는다 — 빌드·테스트 워커에 시그널 리스너를 달면 기본 종료 동작이
 * 사라진다. 상태는 globalThis 에 둬 dev HMR 이나 청크가 나뉘어 모듈이 여러 번 평가돼도 하나로 쓴다.
 */
type ShutdownState = { ends: Set<() => void>; started: boolean }

const globalForShutdown = globalThis as unknown as { __bebeSseShutdown?: ShutdownState }

function shutdownState(): ShutdownState {
  const existing = globalForShutdown.__bebeSseShutdown
  if (existing) return existing
  const state: ShutdownState = { ends: new Set(), started: false }
  const endAll = () => {
    state.started = true
    for (const end of [...state.ends]) {
      try {
        end()
      } catch (err) {
        console.error('sse shutdown: failed to end a stream:', err)
      }
    }
  }
  process.once('SIGTERM', endAll)
  process.once('SIGINT', endAll)
  globalForShutdown.__bebeSseShutdown = state
  return state
}

/**
 * 서버 부팅 때 한 번 — 첫 스트림을 기다리지 않고 시그널을 듣는다. 이게 없으면 아직 스트림이 없던
 * 프로세스에 SIGTERM 이 온 순간 인증을 기다리던 첫 SSE 요청이, 503 대신 아무도 끝내 주지 않는
 * 스트림을 열어 종료를 다시 붙잡았다.
 */
export function listenForServerShutdown(): void {
  shutdownState()
}

/** 종료가 시작됐는가 — 그 뒤에 연 스트림은 아무도 끝내 주지 않는다. */
export function serverShuttingDown(): boolean {
  return globalForShutdown.__bebeSseShutdown?.started ?? false
}

/** 서버가 내려갈 때 부를 함수를 건다. 돌려준 함수로 뗀다 — 끝난 스트림은 반드시 뗄 것. */
export function onServerShutdown(end: () => void): () => void {
  const { ends } = shutdownState()
  ends.add(end)
  return () => {
    ends.delete(end)
  }
}
