'use client'
import { MemberActionsMenu } from '@/components/family/member-actions-menu'
import type { FamilyMember } from '@/server/family/list-members'
import type { Role } from '@bebe/db-public'

const ROLE_META: Record<Role, { label: string; className: string }> = {
  owner: { label: '관리자', className: 'bg-point-500/12 text-point-600 dark:text-point-300' },
  guardian: {
    label: '보호자',
    className: 'bg-base-200/70 text-base-700 dark:bg-base-800 dark:text-base-200',
  },
  family: {
    label: '가족',
    className: 'bg-base-100 text-base-500 dark:bg-base-800/60 dark:text-base-400',
  },
}

function Avatar({ member }: { member: FamilyMember }) {
  if (member.avatarPath) {
    return (
      // biome-ignore lint/performance/noImgElement: 아바타는 우리가 생성한 작은 이미지 — next/image 불필요(§17.3 unoptimized)
      <img
        src={member.avatarPath}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-[16px] font-semibold text-point-500">
      {member.displayName.charAt(0)}
    </div>
  )
}

export function MemberList({
  members,
  currentUserId,
  isAdmin,
}: {
  members: FamilyMember[]
  currentUserId: string
  isAdmin: boolean
}) {
  const activeCount = members.filter((m) => !m.removed).length
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-semibold text-base-500">구성원 {activeCount}명</h2>
      <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
        {members.map((m) => {
          const meta = ROLE_META[m.role]
          const isSelf = m.userId === currentUserId
          const canManage = isAdmin && !isSelf && m.role !== 'owner' && !m.removed
          return (
            <div
              key={m.membershipId}
              className={`flex items-center gap-3 px-4 py-3 ${m.removed ? 'opacity-50' : ''}`}
            >
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`truncate text-[15px] font-medium text-base-900 dark:text-base-50 ${m.removed ? 'line-through' : ''}`}
                  >
                    {m.displayName}
                  </span>
                  {isSelf && (
                    <span className="shrink-0 rounded-md bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold text-base-500 dark:bg-base-800">
                      나
                    </span>
                  )}
                  {m.suspendedAt && !m.removed && (
                    <span className="shrink-0 rounded-md bg-red-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      일시정지
                    </span>
                  )}
                  {m.removed && (
                    <span className="shrink-0 rounded-md bg-base-200 px-1.5 py-0.5 text-[10px] font-semibold text-base-500 dark:bg-base-800">
                      제외됨
                    </span>
                  )}
                </div>
                <span className="block truncate text-[13px] text-base-400">
                  {m.username ? `@${m.username}` : m.email}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${meta.className}`}
              >
                {meta.label}
              </span>
              {canManage && <MemberActionsMenu member={m} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}
