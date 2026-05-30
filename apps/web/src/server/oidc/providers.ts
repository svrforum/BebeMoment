import { encryptSecret } from '@/lib/crypto'
import type { OidcProvider, PrismaClient } from '@bebe/db-public'

export type CreateProviderInput = {
  name: string
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string[]
  kind?: string | undefined
}

export async function createProvider(
  input: CreateProviderInput,
  secretKey: string,
  prisma: PrismaClient,
): Promise<OidcProvider> {
  const enc = await encryptSecret(input.clientSecret, secretKey)
  return prisma.oidcProvider.create({
    data: {
      name: input.name,
      kind: input.kind === 'naver' ? 'naver' : 'oidc',
      issuer: input.issuer,
      clientId: input.clientId,
      clientSecretEnc: enc,
      scopes: input.scopes,
      enabled: true,
    },
  })
}

export async function listProviders(prisma: PrismaClient): Promise<OidcProvider[]> {
  return prisma.oidcProvider.findMany({ orderBy: { createdAt: 'asc' } })
}

export async function getProvider(id: string, prisma: PrismaClient): Promise<OidcProvider | null> {
  return prisma.oidcProvider.findUnique({ where: { id } })
}

export type UpdateProviderInput = {
  name?: string | undefined
  issuer?: string | undefined
  clientId?: string | undefined
  scopes?: string[] | undefined
  enabled?: boolean | undefined
  clientSecret?: string | undefined
}

export async function updateProvider(
  id: string,
  input: UpdateProviderInput,
  secretKey: string,
  prisma: PrismaClient,
): Promise<OidcProvider> {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.issuer !== undefined) data.issuer = input.issuer
  if (input.clientId !== undefined) data.clientId = input.clientId
  if (input.scopes !== undefined) data.scopes = input.scopes
  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.clientSecret !== undefined && input.clientSecret.length > 0) {
    data.clientSecretEnc = await encryptSecret(input.clientSecret, secretKey)
  }
  return prisma.oidcProvider.update({ where: { id }, data })
}

export async function deleteProvider(id: string, prisma: PrismaClient): Promise<void> {
  await prisma.oidcProvider.delete({ where: { id } })
}
