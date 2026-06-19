import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// List a client's logged communications (emails, and later reminders), most
// recent first — powers the Recent Communication card in the workspace. Returns
// up to 50; the card shows the latest 5 with a "View all" expander.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('communications')
      .select('id, type, direction, subject, preview, status, sent_at')
      .eq('client_id', params.id)
      .order('sent_at', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ communications: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
