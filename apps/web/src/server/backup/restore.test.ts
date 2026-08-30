import { type TestDb, startTestDb } from '@bebe/db-public/src/test-db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertRoleCreatable, isFatalPgRestoreError, psqlScript } from './restore'

describe('isFatalPgRestoreError', () => {
  it('pg_restore error: 라인이 있으면 치명(복구 실패로 본다)', () => {
    expect(
      isFatalPgRestoreError(
        'pg_restore: error: could not execute query: ERROR: relation "x" does not exist',
      ),
    ).toBe(true)
    expect(isFatalPgRestoreError('pg_restore: warning: errors ignored on restore: 3')).toBe(true)
  })

  it('순수 경고/빈 출력은 비치명(--if-exists 의 양성 노이즈)', () => {
    expect(isFatalPgRestoreError('pg_restore: warning: implied data-only restore')).toBe(false)
    expect(isFatalPgRestoreError('')).toBe(false)
  })
})

describe('assertRoleCreatable', () => {
  it('약한 기본 비밀번호로는 만들지 않는다 — 복구가 약한 자격증명을 영구 고착시킨다', () => {
    expect(() => assertRoleCreatable('bebe_web', 'bebe')).toThrow()
    expect(() => assertRoleCreatable('bebe_web', '')).toThrow()
  })

  it('allowlist 밖 이름은 거부한다 — 롤 이름은 파라미터화가 안 된다', () => {
    expect(() => assertRoleCreatable('postgres', 'a-strong-password-for-the-test')).toThrow()
    expect(() => assertRoleCreatable('bebe_web; DROP DATABASE bebe', 'strong-enough')).toThrow()
  })

  it('허용된 이름 + 강한 비밀번호는 통과', () => {
    expect(() => assertRoleCreatable('bebe_web', 'a-strong-password-for-the-test')).not.toThrow()
    expect(() => assertRoleCreatable('bebe_media', 'a-strong-password-for-the-test')).not.toThrow()
  })
})

describe('psqlScript', () => {
  let db: TestDb
  beforeAll(async () => {
    db = await startTestDb()
  }, 180_000)
  afterAll(async () => {
    await db.stop()
  })

  // 새 기기 복구의 롤 생성이 이 치환에 걸려 있다. `-c` 로는 치환이 안 되는데, 정작
  // 필요할 때(재해 복구)에만 드러나므로 여기서 못 박는다.
  it("psql 변수 :'var' 를 치환한다", async () => {
    const out = await psqlScript(db.url, { pw: 'a-strong-password-for-the-test' }, "SELECT :'pw';")
    expect(out).toContain('a-strong-password-for-the-test')
  })

  it('작은따옴표가 든 값도 안전하게 인용한다', async () => {
    const out = await psqlScript(db.url, { pw: "quote'inside" }, "SELECT :'pw';")
    expect(out).toContain("quote'inside")
  })

  it('문장이 실패하면 종료코드가 0 이 아니다 — 실패한 CREATE ROLE 이 성공으로 보이면 안 된다', async () => {
    await expect(psqlScript(db.url, {}, 'SELECT this_is_not_valid_sql(;')).rejects.toThrow()
  })

  it('실패 메시지에 비밀번호를 담지 않는다 — 에러는 설정·로그로 흘러간다', async () => {
    const secret = 'do-not-leak-this-value'
    const err = await psqlScript(db.url, { pw: secret }, 'SELECT bad_syntax(;').then(
      () => null,
      (e: Error) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).not.toContain(secret)
  })
})
