import { prismaPublic } from '@/lib/db-init'
import { getSetting } from '@/server/settings/get'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// Public: the non-secret Firebase client config the native app needs to
// initialize a secondary FirebaseApp. NOT the service account (server-only).
export async function GET() {
  const raw = await getSetting('push.fcm_client_config', z.string().nullable(), null, prismaPublic)
  if (!raw) return NextResponse.json({ configured: false })
  try {
    const c = JSON.parse(raw) as Record<string, string>
    if (!c.apiKey || !c.appId || !c.projectId || !c.messagingSenderId) {
      return NextResponse.json({ configured: false })
    }
    return NextResponse.json({
      configured: true,
      apiKey: c.apiKey,
      appId: c.appId,
      projectId: c.projectId,
      messagingSenderId: c.messagingSenderId,
    })
  } catch {
    return NextResponse.json({ configured: false })
  }
}
