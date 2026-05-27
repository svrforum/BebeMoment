import type { FamilyMember } from '@/server/family/list-members'
import type { Role } from '@bebe/db-public'

const ROLE_META: Record<Role, { label: string; className: string }> = {
  owner: {
    label: '관리자',
    className: 'bg-point-500/12 text-point-600 dark:text-point-300',
  },
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
    // biome-ignore lint/performance/noImgElement: 아바타는 우리가 생성한 작은 이미지 — next/image 불필요(§17.3 unoptimized)
    return (
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
}: {
  members: FamilyMember[]
  currentUserId: string
}) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-semibold text-base-500">구성원 {members.length}명</h2>
      <div className="overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 shadow-card divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
        {members.map((m) => {
          const meta = ROLE_META[m.role]
          const handle = m.username ? `@${m.username}` : m.email
          return (
            <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium text-base-900 dark:text-base-50">
                    {m.displayName}
                  </span>
                  {m.userId === currentUserId && (
                    <span className="shrink-0 rounded-md bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold text-base-500 dark:bg-base-800">
                      나
                    </span>
                  )}
                </div>
                {handle && <div className="truncate text-[12px] text-base-400">{handle}</div>}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
              >
                {meta.label}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
