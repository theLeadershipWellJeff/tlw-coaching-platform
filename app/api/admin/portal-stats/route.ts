import { NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { listPortalUsers } from '@/lib/admin/debrief'

export const runtime = 'nodejs'

/**
 * Client Portal key statistics for the Command Center card. Counts only —
 * never a name, a document, or a message. Supervisor-only via adminContext.
 */
export async function GET() {
  try {
    const { supabase } = await adminContext()
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
    const [users, { data: companies }, { data: cohorts }, { data: tickets }, { data: recentEvents }] = await Promise.all([
      listPortalUsers(supabase),
      supabase.from('companies').select('id'),
      supabase.from('cohorts').select('id, status, seats_purchased'),
      supabase.from('support_tickets').select('id, status'),
      supabase.from('portal_events').select('event_type, client_id').gte('created_at', since7d).limit(5000),
    ])
    const byKind = { coaching: 0, coaching_zf: 0, standalone: 0, enterprise: 0 }
    let invited = 0
    let active = 0
    let reportsComplete = 0
    let reportsHeld = 0
    let reportsMissing = 0
    for (const u of users) {
      byKind[u.kind]++
      if (u.portal.invitedAt) invited++
      if (u.portal.lastSeenAt) active++
      if (u.document?.extraction_status === 'complete') reportsComplete++
      else if (u.document) reportsHeld++
      else if (u.assessments_enabled) reportsMissing++
    }
    const activeCohorts = (cohorts || []).filter((c) => c.status === 'active' || !c.status)
    const seatsPurchased = activeCohorts.reduce((n, c) => n + (c.seats_purchased || 0), 0)
    const cohortIds = new Set(activeCohorts.map((c) => c.id))
    const seatsActivated = users.filter((u) => u.cohort_id && cohortIds.has(u.cohort_id)).length
    const ev = recentEvents || []
    const chatMessages7d = ev.filter((e) => e.event_type === 'chat_message').length
    const activeClients7d = new Set(ev.map((e) => e.client_id)).size
    const plansSaved7d = ev.filter((e) => e.event_type === 'weekly_plan_saved').length
    return NextResponse.json({
      users: users.length,
      byKind,
      invited,
      active,
      companies: (companies || []).length,
      activeCohorts: activeCohorts.length,
      seatsPurchased,
      seatsActivated,
      reportsComplete,
      reportsHeld,
      reportsMissing,
      openTickets: (tickets || []).filter((t) => t.status === 'open').length,
      chatMessages7d,
      activeClients7d,
      plansSaved7d,
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
