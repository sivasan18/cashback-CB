import { handleApiRequest, type Env } from '../server'

export const onRequest: PagesFunction<Env> = async (context) => {
  return handleApiRequest(context.request, context.env)
}

