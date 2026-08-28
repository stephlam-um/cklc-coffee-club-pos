import { getBootstrap } from '@/lib/server/pos-data.mjs'
import { getSupabaseAdmin } from '@/lib/server/supabase.mjs'
import { errorResponse, successResponse } from '@/lib/server/http.mjs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try { return successResponse(await getBootstrap(getSupabaseAdmin())) } catch (error) { return errorResponse(error.message) }
}
