import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import Link from 'next/link'

const sections = [
  { href: '/admin/general', label: '일반', description: '앱 이름, 기본 테마' },
  { href: '/admin/features', label: '기능', description: '좋아요·댓글 등 기능별 사용 여부' },
  { href: '/admin/auth', label: '인증', description: '가입 허용, OIDC 프로바이더' },
  {
    href: '/admin/members',
    label: '구성원 권한',
    description: '가족 구성원이 할 수 있는 작업 설정',
  },
  { href: '/admin/smtp', label: 'SMTP', description: '이메일 발송 설정 + 테스트' },
  { href: '/admin/storage', label: '스토리지', description: '로컬/S3 모드 확인' },
  { href: '/admin/retention', label: '리텐션', description: '휴지통 자동 삭제' },
  { href: '/admin/notifications', label: '알림', description: '푸시 알림 + VAPID 키' },
]

export default function AdminPage() {
  return (
    <>
      <AppHeader title="관리자" subtitle="인스턴스 설정" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-2">
        {sections.map((s) => (
          <Button key={s.href} asChild variant="ghost" className="w-full h-auto">
            <Link href={s.href} className="flex items-center justify-between py-3 px-4">
              <span className="flex-1 text-left">
                <span className="block font-medium">{s.label}</span>
                <span className="block text-xs text-base-500">{s.description}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-base-400" />
            </Link>
          </Button>
        ))}
      </div>
    </>
  )
}
