import { NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { listAssignableCoaches } from '@/lib/admin/coach-assignment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Every coach, for the Client Portal's coach pulldowns and the Coaches tab:
 * name, whether they have connected Google (calendar sync needs it), their
 * booking link and scheduling assistant, and how many clients they hold.
 */
export async function GET() {
  try {
    const { supabase } = await adminContext()
    const result = await listAssignableCoaches(supabase)
    return NextResponse.json(result)
  } catch (e) {
    return adminErrorResponse(e)
  }
}
