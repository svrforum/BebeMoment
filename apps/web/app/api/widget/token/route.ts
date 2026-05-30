import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { issueWidgetToken } from '@/server/widget/token'
import { NextResponse } from 'next/server'

export async function POST() {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = await issueWidgetToken(session.userId, prismaPublic)
  return NextResponse.json({ token })
}
