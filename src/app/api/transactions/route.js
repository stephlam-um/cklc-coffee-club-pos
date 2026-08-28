import { createOrGetTransaction } from '@/lib/server/pos-service.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, readJson, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function POST(request) {
  try {
    const actor = requireActor(request, readStaffSession)
    const body = await readJson(request)
    return successResponse(await createOrGetTransaction(getSupabaseAdmin(), body.transaction, actor))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
