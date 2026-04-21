import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createProvider, deleteProvider, listProviders, updateProvider } from './providers'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.oidcProvider.deleteMany()
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
      db.prisma,
    )
    expect(p.id).toBeTruthy()
    expect(p.clientSecretEnc).not.toBe('topsecret')
    expect(p.enabled).toBe(true)
  })

  it('lists enabled providers', async () => {
    await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prisma,
    )
    const list = await listProviders(db.prisma)
    expect(list).toHaveLength(1)
  })

  it('updates name', async () => {
    const p = await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prisma,
    )
    await updateProvider(p.id, { name: 'B' }, SECRET, db.prisma)
    const list = await listProviders(db.prisma)
    expect(list[0]?.name).toBe('B')
  })

  it('deletes', async () => {
    const p = await createProvider(
      { name: 'A', issuer: 'https://a', clientId: 'c', clientSecret: 's', scopes: [] },
      SECRET,
      db.prisma,
    )
    await deleteProvider(p.id, db.prisma)
    expect(await listProviders(db.prisma)).toHaveLength(0)
  })
})
