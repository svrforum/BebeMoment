import { AppHeader } from '@/components/shell/app-header'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import Link from 'next/link'

export default async function SettingsPage() {
  const { session } = await getAuth()
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) return null

  return (
    <>
      <AppHeader title="설정" />
      <div className="mx-auto max-w-3xl px-5 py-4 space-y-4">
        <Card>
          <CardBody>
            <h2 className="font-semibold mb-2">계정</h2>
            <p className="text-sm">{user.displayName}</p>
            <p className="text-sm text-base-500">{user.email}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2">
            <h2 className="font-semibold mb-2">관리</h2>
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/babies">아기 관리</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/family">가족 멤버</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/journal">일기</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full justify-start">
              <Link href="/trash">휴지통</Link>
            </Button>
          </CardBody>
        </Card>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="danger" className="w-full">
            로그아웃
          </Button>
        </form>
      </div>
    </>
  )
}
