import { openShift } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, readJson, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function POST(request) {
  try {
    const actor = requireActor(request, readStaffSession)
    const body = await readJson(request)
    if (String(body.staffId) !== actor.id) throw Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED' })
    return successResponse(await openShift(getSupabaseAdmin(), actor.id))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
