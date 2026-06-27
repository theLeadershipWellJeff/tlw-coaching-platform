/**
 * POST /api/billing/accounts/setup-all
 *
 * Creates solo billing accounts for every active client that doesn't already
 * have one, and links them as coachees. Safe to run multiple times — skips
 * clients that already have a coachee row.
 *
 * Returns:
 *   created  — number of new accounts + coachee links created
 *   skipped  — clients already linked to a billing account
 *   noEmail  — clients skipped because they have no email (billing email required)
 *   details  — array of { name, status } for each client
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load all clients for this coach.
  const { data: links } = await supabase
    .from('coach_clients')
    .select('client_id, clients ( id, name, email )')
    .eq('coach_id', coach.id)

  if (!links || links.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, noEmail: 0, details: [] })
  }

  // Load existing coachee client_ids for this coach so we can skip them.
  const { data: existing } = await supabase
    .from('coachees')
    .select('client_id')
    .eq('coach_id', coach.id)

  const alreadyLinked = new Set((existing ?? []).map((r) => r.client_id))

  let created = 0
  let skipped = 0
  let noEmail = 0
  const details: { name: string; status: 'created' | 'skipped' | 'no_email' }[] = []

  for (const link of links) {
    const client = (link as any).clients
    if (!client) continue

    if (alreadyLinked.has(client.id)) {
      skipped++
      details.push({ name: client.name, status: 'skipped' })
      continue
    }

    if (!client.email) {
      noEmail++
      details.push({ name: client.name, status: 'no_email' })
      continue
    }

    // Create a solo billing account using the client's name + email.
    const { data: account, error: accErr } = await supabase
      .from('billing_accounts')
      .insert({
        coach_id: coach.id,
        name: client.name,
        type: 'solo' as const,
        billing_email: client.email,
      })
      .select('id')
      .single()

    if (accErr || !account) {
      details.push({ name: client.name, status: 'no_email' }) // reuse as error bucket
      continue
    }

    // Create the coachee link.
    const { error: coacheeErr } = await supabase
      .from('coachees')
      .insert({
        coach_id: coach.id,
        client_id: client.id,
        billing_account_id: account.id,
      })

    if (coacheeErr) {
      // Roll back the account we just created.
      await supabase.from('billing_accounts').delete().eq('id', account.id)
      details.push({ name: client.name, status: 'no_email' })
      continue
    }

    created++
    details.push({ name: client.name, status: 'created' })
  }

  return NextResponse.json({ created, skipped, noEmail, details })
}
