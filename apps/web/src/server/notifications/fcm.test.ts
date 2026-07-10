import { createVerify, generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSignedJwt, parseServiceAccount, sendFcm } from './fcm'

describe('sendFcm server field (multi-instance routing)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function capture(
    serverBase: string | undefined,
    publicUrl: string | undefined,
  ): Promise<string> {
    if (publicUrl === undefined) vi.stubEnv('PUBLIC_URL', '')
    else vi.stubEnv('PUBLIC_URL', publicUrl)
    let sentBody = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        sentBody = init.body
        return { ok: true, status: 200 } as Response
      }),
    )
    await sendFcm('tok', { title: 't', body: 'b', url: '/detail/1' }, 'proj', 'access', serverBase)
    return JSON.parse(sentBody).message.data.server
  }

  it('echoes the explicit serverBase (the app-facing domain) when provided', async () => {
    expect(await capture('https://fam.example.com', 'http://192.0.2.10:3000')).toBe(
      'https://fam.example.com',
    )
  })

  it('falls back to PUBLIC_URL when no serverBase is given', async () => {
    expect(await capture(undefined, 'http://192.0.2.10:3000')).toBe('http://192.0.2.10:3000')
  })

  it('treats an empty serverBase as absent (fallback to PUBLIC_URL)', async () => {
    expect(await capture('', 'http://192.0.2.10:3000')).toBe('http://192.0.2.10:3000')
  })
})

describe('parseServiceAccount', () => {
  it('parses a valid service account', () => {
    const sa = parseServiceAccount(
      JSON.stringify({ project_id: 'p', client_email: 'a@b', private_key: 'k' }),
    )
    expect(sa).toEqual({ projectId: 'p', clientEmail: 'a@b', privateKey: 'k' })
  })

  it('returns null for malformed JSON', () => {
    expect(parseServiceAccount('{')).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    expect(parseServiceAccount(JSON.stringify({ project_id: 'p' }))).toBeNull()
  })
})

describe('buildSignedJwt', () => {
  it('produces an RS256 JWT that verifies against the public key with correct claims', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
    const sa = { projectId: 'p', clientEmail: 'svc@proj.iam', privateKey: pem }
    const now = 1_700_000_000

    const jwt = buildSignedJwt(sa, now)
    const [header, claims, signature] = jwt.split('.')

    const verified = createVerify('RSA-SHA256')
      .update(`${header}.${claims}`)
      .verify(publicKey, signature as string, 'base64url')
    expect(verified).toBe(true)

    const decoded = JSON.parse(Buffer.from(claims as string, 'base64url').toString())
    expect(decoded.iss).toBe('svc@proj.iam')
    expect(decoded.scope).toBe('https://www.googleapis.com/auth/firebase.messaging')
    expect(decoded.aud).toBe('https://oauth2.googleapis.com/token')
    expect(decoded.iat).toBe(now)
    expect(decoded.exp).toBe(now + 3600)
  })
})
