import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds, linkCoachToClient } from '@/lib/client-access'
import { getEngagementProgress } from '@/lib/billing/engagement-progress'

// List the signed-in coach's clients (optionally filtered by status), by name.
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const params = new URL(req.url).searchParams
    const status = params.get('status')
    // By default only return coaching clients. Pass ?type=coach for team coaches,
    // or ?type=all to include both (e.g. search, transcript matching).
    const typeParam = params.get('type')
    const ids = await accessibleClientIds(supabase, coach.id)
    if (ids.length === 0) return NextResponse.json({ clients: [] })

    let query = supabase.from('clients').select('*').in('id', ids).order('name', { ascending: true })
    if (status) query = query.eq('status', status)
    if (typeParam === 'all') {
      // no filter — return everyone
    } else if (typeParam === 'coach') {
      query = query.eq('client_type', 'coach')
    } else {
      query = query.eq('client_type', 'client')
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Pending-agreement indicator (migration 018): clientId → days since the most
    // recent unsigned ('sent') agreement was issued, for the roster's 7-day flag.
    // A client whose agreement is acknowledged on file (signed externally, e.g.
    // Coach Accountable) is covered — never flag a stale platform issue for them.
    const agreementOnFile = new Set((data || []).filter((c) => c.agreement_on_file).map((c) => c.id))
    const pendingAgreements: Record<string, number> = {}
    const { data: pending } = await supabase
      .from('agreements')
      .select('client_id, sent_at')
      .in('client_id', ids)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
    for (const row of pending || []) {
      if (row.client_id in pendingAgreements) continue // keep the most recent
      if (agreementOnFile.has(row.client_id)) continue
      pendingAgreements[row.client_id] = Math.floor(
        (Date.now() - new Date(row.sent_at).getTime()) / (24 * 60 * 60 * 1000)
      )
    }

    const listedIds = (data || []).map((c) => c.id)

    // Next appointment per client — one straight DB read (no calendar round-trip;
    // the hourly cron + workspace views keep `appointments` fresh). Soonest
    // future scheduled session wins.
    const nextAppointments: Record<string, { scheduled_at: string; duration_minutes: number }> = {}
    if (listedIds.length > 0) {
      const { data: appts } = await supabase
        .from('appointments')
        .select('client_id, scheduled_at, duration_minutes')
        .in('client_id', listedIds)
        .eq('coach_id', coach.id)
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
      for (const a of appts || []) {
        if (!a.client_id || a.client_id in nextAppointments) continue // keep the soonest
        nextAppointments[a.client_id] = {
          scheduled_at: a.scheduled_at,
          duration_minutes: a.duration_minutes,
        }
      }
    }

    // Engagement type + sessions progress per client (shared with the
    // workspace name card / Billing block — see lib/billing/engagement-progress.ts).
    const engagementProgress = await getEngagementProgress(supabase, coach.id, listedIds)

    return NextResponse.json({
      clients: data,
      pendingAgreements,
      nextAppointments,
      engagementProgress,
      // For rendering appointment times in the coach's zone on the roster.
      coachTimezone: coach.timezone || null,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Create a client, owned by the signed-in coach.
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const body = await req.json().catch(() => null)
    const name = (body?.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        email: body.email?.trim() || null,
        title: body.title?.trim() || null,
        company: body.company?.trim() || null,
        status: body.status?.trim() || 'active',
        phone: body.phone?.trim() || null,
        ca_client_id: body.ca_client_id?.trim() || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        bio: body.bio?.trim() || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await linkCoachToClient(supabase, coach.id, data.id, 'primary')
    return NextResponse.json({ client: data }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
