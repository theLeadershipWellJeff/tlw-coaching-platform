import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// The client's most recent agenda request (what they want from the next
// session), shown on the workspace once they've submitted it.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('agenda_requests')
      .select('id, items, status, created_at, submitted_at')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ agenda: data || null })
  } catch (e) {
    return toErrorResponse(e)
  }
}
