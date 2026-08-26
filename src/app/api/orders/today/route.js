import { getTodayOrders } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try { requireActor(request, readStaffSession); return successResponse(await getTodayOrders(getSupabaseAdmin())) } catch (error) { return routeError(error) || errorResponse(error.message) }
}
