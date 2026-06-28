import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { Database } from '@/lib/supabase/types'

// Fetch one client.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json({ client: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Update editable fields on a client.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
  const allowed = ['name', 'email', 'title', 'company', 'status', 'phone', 'timezone', 'timezone_label', 'address', 'ca_client_id', 'tags', 'bio', 'coaching_goals', 'key_info', 'coaching_map', 'session_fee', 'client_type'] as const
  const patch: Database['public']['Tables']['clients']['Update'] = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('clients')
      .update(patch)
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sync name/email to the client's solo billing account if one exists.
    if ('name' in patch || 'email' in patch) {
      syncBillingAccount(supabase, params.id, patch).catch(() => {})
    }

    return NextResponse.json({ client: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

async function syncBillingAccount(
  supabase: ReturnType<typeof import('@/lib/supabase/server').getSupabaseAdmin>,
  clientId: string,
  patch: { name?: any; email?: any },
) {
  const { data: coachee } = await (supabase as any)
    .from('coachees')
    .select('billing_account_id, billing_accounts ( id, type )')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!coachee?.billing_account_id) return
  const account = coachee.billing_accounts
  if (account?.type !== 'solo') return

  const update: Record<string, string> = {}
  if ('name' in patch && patch.name) update.name = patch.name
  if ('email' in patch && patch.email) update.billing_email = patch.email
  if (Object.keys(update).length === 0) return

  await (supabase as any)
    .from('billing_accounts')
    .update(update)
    .eq('id', coachee.billing_account_id)
}

// Delete a client (cascades to its notes + actions).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { error } = await supabase.from('clients').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
