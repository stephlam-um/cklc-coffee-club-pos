import { deferPendingOrder, getAllPendingOrders } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, readJson, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    requireActor(request, readStaffSession)
    return successResponse(await getAllPendingOrders(getSupabaseAdmin()))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}

export async function PATCH(request) {
  try {
    const actor = requireActor(request, readStaffSession)
    return successResponse(await deferPendingOrder(getSupabaseAdmin(), await readJson(request), actor.id))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
