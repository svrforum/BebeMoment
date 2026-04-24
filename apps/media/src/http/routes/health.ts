import type { FastifyPluginAsync } from 'fastify'

const VERSION = process.env.npm_package_version ?? '0.1.0'
const MIN_WEB_VERSION = '0.1.0'

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/media/v1/health', async () => ({
    v: 1,
    version: VERSION,
    minWebVersion: MIN_WEB_VERSION,
    ready: true,
  }))
}
