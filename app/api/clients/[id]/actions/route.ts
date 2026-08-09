import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseForClaims } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { tenantClaimsFromCoach } from '@/lib/tenant'

// List a client's persisted action items (those sent to the client via a note
// email), most recent first — so the coach can see what's been marked done.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Authorize on admin, read on the org-scoped JWT client (RLS backstop, §5.3).
    const admin = getSupabaseAdmin()
    const coach = await requireClientCoach(admin, params.id)
    const db = getSupabaseForClaims(tenantClaimsFromCoach(coach))

    const { data, error } = await db
      .from('actions')
      .select('id, note_id, description, status, due_date, completed_at, created_at')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ actions: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
