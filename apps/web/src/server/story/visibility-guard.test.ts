import { describe, expect, it } from 'vitest'
import { assertCanSetStoryVisibility } from './visibility-guard'

describe('assertCanSetStoryVisibility', () => {
  // 앨범은 서버에서 막는데(album/update.ts) 스토리는 클라이언트에서만 막고 있었다.
  // family 역할이 guardians 스토리를 만들면 그 사진들이 family 전체에게서 사라진다.
  it('family 역할은 비밀(guardians)로 바꿀 수 없다', () => {
    expect(() => assertCanSetStoryVisibility('family', 'guardians', 'family')).toThrow()
  })

  it('owner·guardian 은 가능하다', () => {
    expect(() => assertCanSetStoryVisibility('owner', 'guardians', 'family')).not.toThrow()
    expect(() => assertCanSetStoryVisibility('guardian', 'guardians', 'family')).not.toThrow()
  })

  // 되돌리는 방향도 막아야 한다 — 보호자가 비밀로 바꾼 스토리를 작성자가 되열 수 있으면
  // 가드가 반쪽이다.
  it('family 역할은 공개(family)로 되돌리는 것도 못 한다', () => {
    expect(() => assertCanSetStoryVisibility('family', 'family', 'guardians')).toThrow()
  })

  // 편집 폼은 현재 가시성을 그대로 되보낸다 — 값이 바뀌지 않았는데 거부하면 family 편집자는
  // 본문 한 줄도 못 고친다(모든 저장이 403 이던 회귀).
  it('family 역할이라도 현재 값과 같으면 통과한다', () => {
    expect(() => assertCanSetStoryVisibility('family', 'family', 'family')).not.toThrow()
    expect(() => assertCanSetStoryVisibility('family', 'guardians', 'guardians')).not.toThrow()
  })

  it('가시성을 건드리지 않으면(undefined) 통과한다', () => {
    expect(() => assertCanSetStoryVisibility('family', undefined, 'guardians')).not.toThrow()
  })
})
