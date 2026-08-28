import { loginStaff } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { createStaffSession, setSessionCookie } from '@/lib/server/session.mjs'
import { errorResponse, readJson, routeError, successResponse } from '@/lib/server/http.mjs'

export async function POST(request) {
  try {
    const body = await readJson(request)
    const staff = await loginStaff(getSupabaseAdmin(), body.staffId, body.pin)
    return setSessionCookie(successResponse({ staff }), createStaffSession(staff))
  } catch (error) { return routeError(error) || errorResponse(error.message) }
}
