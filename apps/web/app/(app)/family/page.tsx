import { InviteManager } from '@/components/family/invite-manager'
import { MemberList } from '@/components/family/member-list'
import { AppHeader } from '@/components/shell/app-header'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { listFamilyMembers } from '@/server/family/list-members'

export default async function FamilyPage() {
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) return null

  const members = await listFamilyMembers(ctx.family.id, prismaPublic)
  const role = ctx.membership?.role ?? 'family'
  const canInvite = role === 'owner' || role === 'guardian'

  return (
    <>
      <AppHeader title="가족" />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 space-y-6">
        <MemberList members={members} currentUserId={ctx.user.id} />
        {canInvite && <InviteManager />}
      </div>
    </>
  )
}
