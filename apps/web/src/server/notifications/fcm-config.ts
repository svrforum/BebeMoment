export type FcmClientConfig = {
  apiKey: string
  appId: string
  projectId: string
  messagingSenderId: string
}

/**
 * 앱이 FCM 토큰 발급에 쓰는 공개 firebaseConfig(apiKey·appId·projectId·messagingSenderId)를
 * 정규화한다. 관리자가 Firebase 에서 받는 파일을 그대로 올릴 수 있게 두 입력을 모두 받는다:
 *   1) firebaseConfig 객체 그대로 ({ apiKey, appId, projectId, messagingSenderId })
 *   2) 안드로이드 google-services.json (project_info + client[]) → 필요한 4개만 추출
 * 둘 다 아니면 null. (서비스 계정 private key 는 여기 없다 — 그건 별도 비밀 파일.)
 */
export function normalizeFcmClientConfig(json: string): FcmClientConfig | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  // 1) 이미 firebaseConfig 형태.
  const direct = pick(obj)
  if (direct) return direct

  // 2) google-services.json 에서 추출.
  const projectInfo = obj.project_info as Record<string, unknown> | undefined
  const clients = obj.client as unknown[] | undefined
  const client0 = (Array.isArray(clients) ? clients[0] : undefined) as
    | Record<string, unknown>
    | undefined
  if (!projectInfo || !client0) return null
  const clientInfo = client0.client_info as Record<string, unknown> | undefined
  const apiKeyArr = client0.api_key as unknown[] | undefined
  const apiKey0 = (Array.isArray(apiKeyArr) ? apiKeyArr[0] : undefined) as
    | Record<string, unknown>
    | undefined
  const derived = {
    apiKey: str(apiKey0?.current_key),
    appId: str(clientInfo?.mobilesdk_app_id),
    projectId: str(projectInfo.project_id),
    messagingSenderId: str(projectInfo.project_number),
  }
  return derived.apiKey && derived.appId && derived.projectId && derived.messagingSenderId
    ? derived
    : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

function pick(obj: Record<string, unknown>): FcmClientConfig | null {
  const c = {
    apiKey: str(obj.apiKey),
    appId: str(obj.appId),
    projectId: str(obj.projectId),
    messagingSenderId: str(obj.messagingSenderId),
  }
  return c.apiKey && c.appId && c.projectId && c.messagingSenderId ? c : null
}
