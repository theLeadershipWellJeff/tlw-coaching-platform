import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

export const runtime = 'nodejs'

/** Prep sheets sent to this client, most recent first (for the workspace card). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('prep_sheets')
      .select('id, content, html, sent_at')
      .eq('client_id', params.id)
      .order('sent_at', { ascending: false })
      .limit(10)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ prepSheets: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
