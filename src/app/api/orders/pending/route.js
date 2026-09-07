import { assertManager, getAllPendingOrders } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const actor = requireActor(request, readStaffSession)
    assertManager(actor)
    return successResponse(await getAllPendingOrders(getSupabaseAdmin()))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
