import { describe, expect, it } from 'vitest'
import { normalizeFcmClientConfig } from './fcm-config'

const EXPECTED = {
  apiKey: 'AIzaSyExample',
  appId: '1:711368522207:android:a47681fe0a71f05',
  projectId: 'bebe-eb048',
  messagingSenderId: '711368522207',
}

describe('normalizeFcmClientConfig', () => {
  it('accepts a firebaseConfig object as-is', () => {
    expect(normalizeFcmClientConfig(JSON.stringify(EXPECTED))).toEqual(EXPECTED)
  })

  it('derives the 4 fields from google-services.json', () => {
    const googleServices = JSON.stringify({
      project_info: {
        project_number: '711368522207',
        project_id: 'bebe-eb048',
        storage_bucket: 'bebe-eb048.appspot.com',
      },
      client: [
        {
          client_info: {
            mobilesdk_app_id: '1:711368522207:android:a47681fe0a71f05',
            android_client_info: { package_name: 'im.bebe.app' },
          },
          api_key: [{ current_key: 'AIzaSyExample' }],
        },
      ],
    })
    expect(normalizeFcmClientConfig(googleServices)).toEqual(EXPECTED)
  })

  it('coerces a numeric project_number to string', () => {
    const gs = JSON.stringify({
      project_info: { project_number: 711368522207, project_id: 'p' },
      client: [{ client_info: { mobilesdk_app_id: 'a' }, api_key: [{ current_key: 'k' }] }],
    })
    expect(normalizeFcmClientConfig(gs)?.messagingSenderId).toBe('711368522207')
  })

  it('returns null for invalid / incomplete input', () => {
    expect(normalizeFcmClientConfig('not json')).toBeNull()
    expect(normalizeFcmClientConfig(JSON.stringify({ apiKey: 'only' }))).toBeNull()
    expect(normalizeFcmClientConfig(JSON.stringify({ project_info: {}, client: [] }))).toBeNull()
  })
})
