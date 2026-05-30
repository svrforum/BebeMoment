import type { PrismaClient } from '@bebe/db-public'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSetting } from '@/server/settings/get'

const HiddenSchema = z.array(z.string())

/**
 * 관리자가 일반 가족에게 숨긴 메뉴(nav.family.hidden)는 URL 직접 진입도 막는다(네비
 * 숨김만으론 우회 가능했음). owner/guardian 은 항상 허용. 숨겨진 메뉴면 타임라인으로.
 */
export async function assertMenuAccess(
  menuKey: string,
  role: string | null,
  prisma: PrismaClient,
): Promise<void> {
  if (role === 'owner' || role === 'guardian') return
  const hidden = await getSetting('nav.family.hidden', HiddenSchema, [], prisma)
  if (hidden.includes(menuKey)) redirect('/timeline')
}
