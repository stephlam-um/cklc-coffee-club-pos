import { syncClosedShift } from '@/lib/server/sheets-sync.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function POST(request, { params }) {
  try {
    requireActor(request, readStaffSession)
    const { shiftId } = await params
    return successResponse(await syncClosedShift(getSupabaseAdmin(), shiftId))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
