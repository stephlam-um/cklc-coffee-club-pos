import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { requireActor, routeError, successResponse } from '@/lib/server/http.mjs'
import { readStaffSession } from '@/lib/server/session.mjs'

export async function GET(request) {
  try {
    const actor = requireActor(request, readStaffSession)
    const { data, error } = await getSupabaseAdmin().rpc('get_staff_rewards', { p_staff_id: actor.id })
    if (error) throw error
    return successResponse(data)
  } catch (error) { return routeError(error) }
}
