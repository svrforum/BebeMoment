import { prisma } from '@/lib/prisma'
import { getStorage } from '@/lib/storage'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { assertServiceToken } from '../middleware/service-token'

const Query = z.object({ familyId: z.string().uuid() })

/**
 * 되살릴 수 없는 자산(실패 + 원본 바이트 없음)의 id 목록.
 *
 * 업로드가 중간에 끊기면 행만 남고 바이트는 없다. 그 행은 재시도해도 매번 같은 ENOENT 로
 * 끝나는데, 화면에는 그냥 '실패'로 보여 계속 누르게 되고 목록에도 계속 남는다(5월 것이
 * 9월까지 남아 있었다). 원본 유무는 스토리지를 가진 media 만 판단할 수 있으므로 여기서
 * 알려주고, 실제 삭제는 public 스키마까지 정리해야 하므로 web 이 한다(§8·§9 경계).
 */
export const assetsUnrecoverableRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/assets/unrecoverable', async (req, reply) => {
    assertServiceToken(req.headers.authorization)
    const { familyId } = Query.parse(req.query)
    const rows = await prisma.asset.findMany({
      where: { familyId, status: 'failed', deletedAt: null },
      select: { id: true, originalKey: true },
    })
    const storage = getStorage()
    const assetIds: string[] = []
    for (const r of rows) {
      if (!(await storage.exists(r.originalKey))) assetIds.push(r.id)
    }
    reply.status(200).send({ v: 1, assetIds })
  })
}
