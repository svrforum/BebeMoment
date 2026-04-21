import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function deriveKey(secretKey: string): Buffer {
  return createHash('sha256').update(secretKey).digest()
}

export async function encryptSecret(plaintext: string, secretKey: string): Promise<string> {
  const key = deriveKey(secretKey)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export async function decryptSecret(encoded: string, secretKey: string): Promise<string> {
  const key = deriveKey(secretKey)
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < 28) throw new Error('Invalid ciphertext')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
