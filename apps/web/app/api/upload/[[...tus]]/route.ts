import { getTusServer } from '@/server/upload/tus-config'

export const dynamic = 'force-dynamic'

async function handle(req: Request): Promise<Response> {
  const server = getTusServer()
  // @tus/server v1.7+ supports handleWeb for Fetch API
  // biome-ignore lint/suspicious/noExplicitAny: feature detection
  const maybeHandleWeb = (server as any).handleWeb
  if (typeof maybeHandleWeb === 'function') {
    return maybeHandleWeb.call(server, req)
  }
  throw new Error('@tus/server does not support handleWeb. Upgrade to v1.7+ or add a Node adapter.')
}

export {
  handle as GET,
  handle as POST,
  handle as HEAD,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
}
