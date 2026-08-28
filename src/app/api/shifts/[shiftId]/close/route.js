import { closeShift } from '@/lib/server/pos-data.mjs'
import { syncClosedShift } from '@/lib/server/sheets-sync.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, readJson, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function POST(request, { params }) {
  try {
    const actor = requireActor(request, readStaffSession)
    const body = await readJson(request)
    const { shiftId } = await params
    const supabase = getSupabaseAdmin()
    const result = await closeShift(supabase, { ...body, shiftId, staffId: actor.id })
    const sync = await syncClosedShift(supabase, shiftId)
    return successResponse({ ...result, sheetSyncStatus: sync.status })
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
