import { prismaPublic } from '@/lib/db-init'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prismaPublic.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', db: 'ok', time: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json(
      { status: 'error', db: 'down', error: (e as Error).message },
      { status: 503 },
    )
  }
}
