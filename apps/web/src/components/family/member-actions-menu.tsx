'use client'
import { useToast } from '@/lib/toast'
import type { FamilyMember } from '@/server/family/list-members'
import { MoreVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ChangeRoleModal } from './change-role-modal'
import { RemoveModal } from './remove-modal'
import { ResetPasswordModal } from './reset-password-modal'
import { SuspendModal } from './suspend-modal'

type ModalKind = 'suspend' | 'reset' | 'remove' | 'role' | null

export function MemberActionsMenu({ member }: { member: FamilyMember }) {
  const t = useTranslations('family')
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const isSuspended = member.suspendedAt !== null

  const unsuspend = () => {
    setOpen(false)
    startTransition(async () => {
      const res = await fetch(`/api/admin/members/${member.membershipId}/unsuspend`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast({ title: data.error ?? t('actions.unsuspendError'), variant: 'danger' })
        return
      }
      router.refresh()
    })
  }

  const pick = (kind: Exclude<ModalKind, null>) => {
    setOpen(false)
    setModal(kind)
  }

  // 드롭다운은 카드의 `overflow-hidden`(둥근 모서리 마스킹)에 잘려 빈 흰 박스로만
  // 보였다. body 로 포털 + 버튼 위치 기준 fixed 배치해 클리핑을 벗어난다(§17#19 패턴).
  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen((v) => !v)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('actions.menuLabel')}
        onClick={toggle}
        disabled={pending}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-400 hover:bg-base-100 disabled:opacity-50 dark:hover:bg-base-800"
      >
        <MoreVertical size={18} />
      </button>

      {open &&
        coords &&
        createPortal(
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
            />
            <div
              style={{ top: coords.top, right: coords.right }}
              className="fixed z-[61] w-44 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 py-1 shadow-card dark:border-base-800/70 dark:bg-base-900"
            >
              {member.role !== 'owner' && (
                <MenuItem label={t('actions.changeRole')} onClick={() => pick('role')} />
              )}
              {isSuspended ? (
                <MenuItem label={t('actions.unsuspend')} onClick={unsuspend} />
              ) : (
                <MenuItem label={t('actions.suspend')} onClick={() => pick('suspend')} />
              )}
              <MenuItem label={t('actions.resetPassword')} onClick={() => pick('reset')} />
              <MenuItem label={t('actions.remove')} danger onClick={() => pick('remove')} />
            </div>
          </>,
          document.body,
        )}

      <ChangeRoleModal
        open={modal === 'role'}
        onOpenChange={(n) => setModal(n ? 'role' : null)}
        membershipId={member.membershipId}
        displayName={member.displayName}
        currentRole={member.role}
      />
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
    </>
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
