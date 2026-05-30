import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createProvider, deleteProvider, listProviders, updateProvider } from './providers'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.oidcProvider.deleteMany()
})

const SECRET = 'x'.repeat(64)

describe('oidc providers', () => {
  it('creates with encrypted client secret', async () => {
    const p = await createProvider(
      {
        name: 'Authentik',
        issuer: 'https://auth.example.com',
        clientId: 'bebe',
        clientSecret: 'topsecret',
        scopes: ['openid', 'email', 'profile'],
      },
      SECRET,
      db.prismaPublic,
    )
    expect(p.id).toBeTruthy()
    expect(p.clientSecretEnc).not.toBe('topsecret')
    expect(p.enabled).toBe(true)
    expect(p.kind).toBe('oidc')
  })

  it('creates a naver (OAuth2) provider with kind=naver', async () => {
    const p = await createProvider(
      { name: '네이버', kind: 'naver', issuer: '', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prismaPublic,
    )
    expect(p.kind).toBe('naver')
  })

  it('lists enabled providers', async () => {
    await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prismaPublic,
    )
    const list = await listProviders(db.prismaPublic)
    expect(list).toHaveLength(1)
  })

  it('updates name', async () => {
    const p = await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prismaPublic,
    )
    await updateProvider(p.id, { name: 'B' }, SECRET, db.prismaPublic)
    const list = await listProviders(db.prismaPublic)
    expect(list[0]?.name).toBe('B')
  })

  it('deletes', async () => {
    const p = await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prismaPublic,
    )
    await deleteProvider(p.id, db.prismaPublic)
    expect(await listProviders(db.prismaPublic)).toHaveLength(0)
  })
})
