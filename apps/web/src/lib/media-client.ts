import { HttpMediaClient, type MediaClient } from '@bebe/media-client'

const globalForMedia = globalThis as unknown as { __bebeMediaClient?: MediaClient }

export function getMediaClient(): MediaClient {
  if (!globalForMedia.__bebeMediaClient) {
    const baseUrl = process.env.MEDIA_INTERNAL_URL
    const serviceToken = process.env.MEDIA_SERVICE_TOKEN
    if (!baseUrl) throw new Error('MEDIA_INTERNAL_URL env required')
    if (!serviceToken) throw new Error('MEDIA_SERVICE_TOKEN env required')
    globalForMedia.__bebeMediaClient = new HttpMediaClient({ baseUrl, serviceToken })
  }
  return globalForMedia.__bebeMediaClient
}
