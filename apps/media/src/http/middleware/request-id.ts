import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export const requestIdPlugin: FastifyPluginAsync = fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const incoming = req.headers['x-request-id']
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID()
    req.headers['x-request-id'] = id
    reply.header('x-request-id', id)
    req.log = req.log.child({ requestId: id })
  })
})
