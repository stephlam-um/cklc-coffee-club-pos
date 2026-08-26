import { updateOrderStatus } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, readJson, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function PATCH(request, { params }) {
  try {
    const actor = requireActor(request, readStaffSession)
    const body = await readJson(request)
    const { transactionId } = await params
    return successResponse(await updateOrderStatus(getSupabaseAdmin(), transactionId, body.fulfillmentStatus, actor.id))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
