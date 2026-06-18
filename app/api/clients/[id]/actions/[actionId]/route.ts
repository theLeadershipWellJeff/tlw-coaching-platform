import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

// PATCH /api/clients/[id]/actions/[actionId]  { status: 'open' | 'done' | 'dropped' }
// Coach-side status toggle for an action item (the capture-panel checkbox). The
// client-facing email link still flips status via the public /api/actions/complete
// endpoint; this is the signed-in equivalent for marking one done by hand.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const status = String(body.status || '')
  if (!['open', 'done', 'dropped'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const patch: Database['public']['Tables']['actions']['Update'] =
    status === 'done'
      ? { status, completed_at: new Date().toISOString(), completed_via: 'coach' }
      : { status, completed_at: null, completed_via: null }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('actions')
    .update(patch)
    .eq('id', params.actionId)
    .eq('client_id', params.id)
    .select('id, description, status, due_date, completed_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ action: data })
}
