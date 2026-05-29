'use client'
import type { FamilyMember } from '@/server/family/list-members'
import { MoreVertical } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RemoveModal } from './remove-modal'
import { ResetPasswordModal } from './reset-password-modal'
import { SuspendModal } from './suspend-modal'

type ModalKind = 'suspend' | 'reset' | 'remove' | null

export function MemberActionsMenu({ member }: { member: FamilyMember }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<ModalKind>(null)
  const [pending, startTransition] = useTransition()

  const isSuspended = member.suspendedAt !== null

  const unsuspend = () => {
    setOpen(false)
    startTransition(async () => {
      await fetch(`/api/admin/members/${member.membershipId}/unsuspend`, { method: 'POST' })
      router.refresh()
    })
  }

  const pick = (kind: Exclude<ModalKind, null>) => {
    setOpen(false)
    setModal(kind)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="멤버 관리"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-400 hover:bg-base-100 disabled:opacity-50 dark:hover:bg-base-800"
      >
        <MoreVertical size={18} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 py-1 shadow-card dark:border-base-800/70 dark:bg-base-900">
            {isSuspended ? (
              <MenuItem label="정지 해제" onClick={unsuspend} />
            ) : (
              <MenuItem label="일시정지" onClick={() => pick('suspend')} />
            )}
            <MenuItem label="비밀번호 재설정" onClick={() => pick('reset')} />
            <MenuItem label="가족에서 제외" danger onClick={() => pick('remove')} />
          </div>
        </>
      )}

      <SuspendModal
        open={modal === 'suspend'}
        onOpenChange={(n) => setModal(n ? 'suspend' : null)}
        membershipId={member.membershipId}
        displayName={member.displayName}
      />
      <ResetPasswordModal
        open={modal === 'reset'}
        onOpenChange={(n) => setModal(n ? 'reset' : null)}
        membershipId={member.membershipId}
        displayName={member.displayName}
      />
      <RemoveModal
        open={modal === 'remove'}
        onOpenChange={(n) => setModal(n ? 'remove' : null)}
        membershipId={member.membershipId}
        displayName={member.displayName}
      />
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-2.5 text-left text-sm ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-base-700 hover:bg-base-100 dark:text-base-200 dark:hover:bg-base-800'
      }`}
    >
      {label}
    </button>
  )
}
