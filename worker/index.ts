import { handleApiRequest, type Env } from '../functions/server'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleApiRequest(request, env)
  }
}

