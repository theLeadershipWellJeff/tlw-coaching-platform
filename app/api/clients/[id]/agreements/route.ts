import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// List a client's agreements (most recent first) for the workspace Agreement
// card: status, dates, recording authorization, and the rendered HTML for "View".
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('agreements')
      .select('id, title, status, sent_at, signed_at, recording_authorized, body_html, signed_agreement_html')
      .eq('client_id', params.id)
      .order('sent_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ agreements: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
