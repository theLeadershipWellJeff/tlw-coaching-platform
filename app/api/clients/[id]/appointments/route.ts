import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// The client's upcoming (future, still-scheduled) sessions, soonest first.
// Drives the workspace Sessions card and the compact list on the name card.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('appointments')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('client_id', params.id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ appointments: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
