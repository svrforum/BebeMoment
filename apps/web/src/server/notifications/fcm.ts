import { createSign } from 'node:crypto'

export type FcmServiceAccount = { projectId: string; clientEmail: string; privateKey: string }

export function parseServiceAccount(raw: string): FcmServiceAccount | null {
  try {
    const j = JSON.parse(raw) as Record<string, string>
    if (!j.project_id || !j.client_email || !j.private_key) return null
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key }
  } catch {
    return null
  }
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

export function buildSignedJwt(
  sa: FcmServiceAccount,
  now: number = Math.floor(Date.now() / 1000),
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${claims}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(sa.privateKey, 'base64url')
  return `${signingInput}.${signature}`
}

export async function getFcmAccessToken(
  sa: FcmServiceAccount,
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildSignedJwt(sa),
    }),
  })
  if (!res.ok) throw new Error(`FCM access token 발급 실패 (${res.status})`)
  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('FCM access token 응답에 토큰이 없습니다')
  const expiresIn =
    typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 3600
  return { token: json.access_token, expiresIn }
}

export type FcmPayload = { title: string; body: string; url: string }

/** 'ok' | 'expired' (token gone — caller deletes it) | 'error'. */
export async function sendFcm(
  token: string,
  payload: FcmPayload,
  projectId: string,
  accessToken: string,
): Promise<'ok' | 'expired' | 'error'> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url },
        android: { priority: 'HIGH' },
      },
    }),
  })
  if (res.ok) return 'ok'
  // Only 404 UNREGISTERED means the token is dead and should be deleted. A 400
  // INVALID_ARGUMENT is usually a payload/config problem that would hit EVERY
  // token — deleting on 400 would wipe the whole table. Surface it instead.
  if (res.status === 404) return 'expired'
  const body = await res.text().catch(() => '')
  console.error(`[fcm] send failed (${res.status}): ${body.slice(0, 300)}`)
  return 'error'
}
