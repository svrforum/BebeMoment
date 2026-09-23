import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { deleteChecklistTemplate, listChecklistTemplates, saveChecklistTemplate } from './templates'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.scheduleChecklistTemplate.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup(name = 'F') {
  const { user } = await signup(
    {
      username: `u${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      password: 'password123',
      displayName: 'U',
    },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name, userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function addMember(familyId: string, role: 'guardian' | 'family') {
  const { user } = await signup(
    {
      username: `m${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      password: 'password123',
      displayName: 'M',
    },
    db.prismaPublic,
  )
  await db.prismaPublic.membership.create({ data: { familyId, userId: user.id, role } })
  return user
}

describe('체크리스트 템플릿', () => {
  it('저장하면 다듬은 항목으로 목록에 나온다', async () => {
    const { user, family } = await setup()
    const r = await saveChecklistTemplate(
      {
        familyId: family.id,
        byUserId: user.id,
        name: ' 병원 준비물 ',
        items: ['분유', ' 기저귀 ', '', '분유'],
      },
      db.prismaPublic,
    )
    expect(r.replaced).toBe(false)
    const list = await listChecklistTemplates(
      { familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    expect(list).toMatchObject([{ name: '병원 준비물', items: ['분유', '기저귀'] }])
  })

  it('같은 이름으로 다시 저장하면 항목을 바꾼다', async () => {
    const { user, family } = await setup()
    await saveChecklistTemplate(
      { familyId: family.id, byUserId: user.id, name: '외출', items: ['a'] },
      db.prismaPublic,
    )
    const r = await saveChecklistTemplate(
      { familyId: family.id, byUserId: user.id, name: '외출', items: ['b', 'c'] },
      db.prismaPublic,
    )
    expect(r.replaced).toBe(true)
    const list = await listChecklistTemplates(
      { familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    expect(list).toHaveLength(1)
    expect(list[0]?.items).toEqual(['b', 'c'])
  })

  it('항목이 하나도 없으면 저장하지 않는다', async () => {
    const { user, family } = await setup()
    await expect(
      saveChecklistTemplate(
        { familyId: family.id, byUserId: user.id, name: 'x', items: ['  ', ''] },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/templateEmpty/)
  })

  it('다른 보호자가 만든 템플릿도 가족 안에서는 함께 쓰고 지울 수 있다', async () => {
    const { user, family } = await setup()
    const guardian = await addMember(family.id, 'guardian')
    const { template } = await saveChecklistTemplate(
      { familyId: family.id, byUserId: user.id, name: '외출', items: ['a'] },
      db.prismaPublic,
    )
    const seen = await listChecklistTemplates(
      { familyId: family.id, byUserId: guardian.id },
      db.prismaPublic,
    )
    expect(seen.map((t) => t.id)).toEqual([template.id])
    await deleteChecklistTemplate(
      { id: template.id, familyId: family.id, byUserId: guardian.id },
      db.prismaPublic,
    )
    expect(
      await listChecklistTemplates({ familyId: family.id, byUserId: user.id }, db.prismaPublic),
    ).toEqual([])
  })

  it('일반 구성원은 보지도 만들지도 못한다', async () => {
    const { family } = await setup()
    const member = await addMember(family.id, 'family')
    await expect(
      listChecklistTemplates({ familyId: family.id, byUserId: member.id }, db.prismaPublic),
    ).rejects.toThrow()
    await expect(
      saveChecklistTemplate(
        { familyId: family.id, byUserId: member.id, name: 'x', items: ['a'] },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('다른 가족의 템플릿은 보이지도 지워지지도 않는다', async () => {
    const a = await setup('A')
    const b = await setup('B')
    const { template } = await saveChecklistTemplate(
      { familyId: a.family.id, byUserId: a.user.id, name: '외출', items: ['a'] },
      db.prismaPublic,
    )
    expect(
      await listChecklistTemplates({ familyId: b.family.id, byUserId: b.user.id }, db.prismaPublic),
    ).toEqual([])
    await expect(
      deleteChecklistTemplate(
        { id: template.id, familyId: b.family.id, byUserId: b.user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/templateNotFound/)
  })
})
