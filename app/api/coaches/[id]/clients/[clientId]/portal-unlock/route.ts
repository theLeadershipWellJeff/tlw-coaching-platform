import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/clients/[clientId]/portal-unlock — clear a client's
 * portal password lockout (8 failed attempts → 15-minute lock) immediately,
 * instead of making them wait it out. Supervisor-only; audit-logged. The
 * password itself is untouched — this only resets the throttle.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; clientId: string } }
) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const { data: link } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', params.id)
    .eq('client_id', params.clientId)
    .maybeSingle()
  if (!link) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('client_credentials')
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('client_id', params.clientId)
    .select('client_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'This client has no portal password set — nothing to unlock.' },
      { status: 400 }
    )
  }

  await logAdminAction(supabase, {
    actorCoachId: actor.id,
    action: 'portal_unlock',
    targetCoachId: params.id,
    targetClientId: params.clientId,
  })

  return NextResponse.json({ ok: true })
}
