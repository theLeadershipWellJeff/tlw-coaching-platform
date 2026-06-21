import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// The coach's indexed garden — leaves + edges — for the Account → Vault panel so
// they can confirm exactly what got indexed (title, type, themes, eligibility,
// links). Note bodies are never stored, so none are returned here.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const [notesRes, edgesRes] = await Promise.all([
      supabase
        .from('garden_notes')
        .select('id, title, type, themes, summary, nudge_eligible, aliases, vault_path, last_synced_at')
        .eq('coach_id', coach.id)
        .order('title', { ascending: true }),
      supabase
        .from('garden_edges')
        .select('source_id, target_id, relation')
        .eq('coach_id', coach.id),
    ])
    if (notesRes.error) return NextResponse.json({ error: notesRes.error.message }, { status: 500 })

    return NextResponse.json({ notes: notesRes.data || [], edges: edgesRes.data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
