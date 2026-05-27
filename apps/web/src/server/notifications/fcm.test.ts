import { createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildSignedJwt, parseServiceAccount } from './fcm'

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
