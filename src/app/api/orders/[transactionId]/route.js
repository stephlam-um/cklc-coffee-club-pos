import { assertManager, deletePendingOrder } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function DELETE(request, { params }) {
  try {
    const actor = requireActor(request, readStaffSession)
    assertManager(actor)
    const { transactionId } = await params
    return successResponse(await deletePendingOrder(getSupabaseAdmin(), transactionId))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
