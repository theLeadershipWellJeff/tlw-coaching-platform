import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import { loadPortalStates } from '@/lib/admin/portal-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/coaches/[id]/clients — the Command Center drill-down: one coach's
 * client roster with each client's portal state (invited / active / locked).
 *
 * Supervisor-only and deliberately cross-tenant: the normal client routes are
 * scoped to the signed-in coach via requireClientCoach, which is correct and
 * stays untouched — this is the one supervised window across that boundary.
 * Nothing coach-private (key_info etc.) is selected.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  try {
    await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const { data: links, error: linkErr } = await supabase
    .from('coach_clients')
    .select('client_id')
    .eq('coach_id', params.id)
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  const clientIds = (links ?? []).map((l: any) => l.client_id)
  if (clientIds.length === 0) return NextResponse.json({ clients: [] })

  const [{ data: rows, error }, portalStates] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, email, status, agreement_on_file')
      .in('id', clientIds)
      .order('name', { ascending: true }),
    loadPortalStates(supabase, clientIds),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clients = (rows ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    status: c.status ?? 'active',
    agreement_on_file: !!c.agreement_on_file,
    portal: portalStates[c.id] ?? { invitedAt: null, lastSeenAt: null, username: null, locked: false },
  }))

  return NextResponse.json({ clients })
}
