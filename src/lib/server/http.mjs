export function successResponse(data, init = {}) {
  return Response.json({ ok: true, data }, { status: 200, ...init })
}

export function errorResponse(error, code = 'BAD_REQUEST', status = 400) {
  return Response.json({ ok: false, code, error: String(error) }, { status })
}

export function routeError(error) {
  const code = String(error?.code || '')
  if (code === 'UNAUTHORIZED' || error?.message === 'Unauthorized') return errorResponse('Unauthorized', 'UNAUTHORIZED', 401)
  if (code === 'CONFLICTING_TRANSACTION' || error?.message === 'CONFLICTING_TRANSACTION') return errorResponse('Transaction ID already belongs to a different order', 'CONFLICTING_TRANSACTION', 409)
  if (code === 'NOT_FOUND') return errorResponse(error.message, code, 404)
  return errorResponse(error?.message || 'Request failed', code || 'BAD_REQUEST', 400)
}

export async function readJson(request) {
  try { return await request.json() } catch { throw Object.assign(new Error('Invalid JSON body'), { code: 'INVALID_JSON' }) }
}

export function requireActor(request, readSession) {
  const actor = readSession(request)
  if (!actor) throw Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
  return actor
}
