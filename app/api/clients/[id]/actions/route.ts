import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// List a client's persisted action items (those sent to the client via a note
// email), most recent first — so the coach can see what's been marked done.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('actions')
      .select('id, description, status, due_date, completed_at, created_at')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ actions: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
