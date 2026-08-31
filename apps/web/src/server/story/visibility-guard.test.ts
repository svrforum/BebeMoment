import { describe, expect, it } from 'vitest'
import { assertCanSetStoryVisibility } from './visibility-guard'

describe('assertCanSetStoryVisibility', () => {
  // 앨범은 서버에서 막는데(album/update.ts) 스토리는 클라이언트에서만 막고 있었다.
  // family 역할이 guardians 스토리를 만들면 그 사진들이 family 전체에게서 사라진다.
  it('family 역할은 비밀(guardians)로 만들 수 없다', () => {
    expect(() => assertCanSetStoryVisibility('family', 'guardians')).toThrow()
  })

  it('owner·guardian 은 가능하다', () => {
    expect(() => assertCanSetStoryVisibility('owner', 'guardians')).not.toThrow()
    expect(() => assertCanSetStoryVisibility('guardian', 'guardians')).not.toThrow()
  })

  // 되돌리는 방향도 막아야 한다 — 보호자가 비밀로 바꾼 스토리를 작성자가 되열 수 있으면
  // 가드가 반쪽이다.
  it('family 역할은 공개(family)로 되돌리는 것도 못 한다', () => {
    expect(() => assertCanSetStoryVisibility('family', 'family')).toThrow()
  })

  it('가시성을 건드리지 않으면(undefined) 통과한다', () => {
    expect(() => assertCanSetStoryVisibility('family', undefined)).not.toThrow()
  })
})
