import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// The coach's indexed frameworks — for the Account → Vault panel so they can see
// exactly what got indexed (name, aliases, edges, last synced).
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { data, error } = await supabase
      .from('frameworks')
      .select('id, slug, name, aliases, trigger_signals, when_to_use, vault_path, linked_slugs, last_synced_at')
      .eq('coach_id', coach.id)
      .order('name', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ frameworks: data || [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}
