import { signFileServeToken } from '@/lib/jwt'

export type SignedUrlArgs = {
  familyId: string
  assetId: string
  key: string
}

export async function buildSignedUrl(args: SignedUrlArgs): Promise<string> {
  const base = (
    process.env.MEDIA_PUBLIC_BASE_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost:3001'
  ).replace(/\/$/, '')
  const token = await signFileServeToken(args)
  return `${base}/media/v1/files/${token}`
}
