import webpush from 'web-push'

type Store = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
}
export type VapidKeys = { publicKey: string; privateKey: string }

export async function ensureVapidKeys(store: Store): Promise<VapidKeys> {
  const pub = await store.get('push.vapid_public')
  const priv = await store.get('push.vapid_private')
  if (pub && priv) return { publicKey: pub, privateKey: priv }
  const generated = webpush.generateVAPIDKeys()
  await store.set('push.vapid_public', generated.publicKey)
  await store.set('push.vapid_private', generated.privateKey)
  return generated
}
