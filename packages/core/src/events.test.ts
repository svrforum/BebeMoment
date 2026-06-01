import { describe, expect, it } from 'vitest'
import {
  ASSET_QUEUE,
  DEFAULT_FACE_CLUSTER_DISTANCE,
  FACE_CLUSTER_DISTANCE_MAX,
  FACE_CLUSTER_DISTANCE_MIN,
  FACES_QUEUE,
  channelForFamily,
} from './events'

describe('channelForFamily', () => {
  it('가족별 고유 pub/sub 채널 이름을 만든다', () => {
    expect(channelForFamily('fam-1')).toBe('bebe:events:family:fam-1')
  })

  it('가족마다 다른 채널을 준다', () => {
    expect(channelForFamily('a')).not.toBe(channelForFamily('b'))
  })

  it('UUID 형태도 그대로 포함한다', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(channelForFamily(id)).toBe(`bebe:events:family:${id}`)
  })
})

describe('queue 상수', () => {
  it('큐 이름이 고정 문자열이다', () => {
    expect(ASSET_QUEUE).toBe('bebe-asset')
    expect(FACES_QUEUE).toBe('bebe-faces')
  })

  it('asset 큐와 faces 큐는 분리돼 있다', () => {
    expect(ASSET_QUEUE).not.toBe(FACES_QUEUE)
  })
})

describe('얼굴 군집 거리 상수', () => {
  it('기본값이 min~max 안전범위 안에 있다', () => {
    expect(DEFAULT_FACE_CLUSTER_DISTANCE).toBeGreaterThanOrEqual(FACE_CLUSTER_DISTANCE_MIN)
    expect(DEFAULT_FACE_CLUSTER_DISTANCE).toBeLessThanOrEqual(FACE_CLUSTER_DISTANCE_MAX)
  })

  it('min < max 이다', () => {
    expect(FACE_CLUSTER_DISTANCE_MIN).toBeLessThan(FACE_CLUSTER_DISTANCE_MAX)
  })
})
