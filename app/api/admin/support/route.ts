import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'

export const runtime = 'nodejs'

/** Support tickets with client / company / cohort context. ?status=open|closed (default open first, all). */
export async function GET(req: NextRequest) {
  try {
    const { supabase } = await adminContext()
    const status = req.nextUrl.searchParams.get('status') || undefined
    let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(300)
    if (status) q = q.eq('status', status)
    const { data: tickets, error } = await q
    if (error) throw new AdminError(500, error.message)
    const ids = Array.from(new Set((tickets || []).map((t) => t.client_id)))
    const [{ data: clients }, { data: companies }, { data: cohorts }, { data: messages }] = await Promise.all([
      ids.length ? supabase.from('clients').select('id, name, email, company_id, cohort_id').in('id', ids) : Promise.resolve({ data: [] as any[] }),
      supabase.from('companies').select('id, name'),
      supabase.from('cohorts').select('id, name'),
      (tickets || []).length
        ? supabase.from('support_ticket_messages').select('*').in('ticket_id', (tickets || []).map((t) => t.id)).order('created_at', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ])
    const client = new Map((clients || []).map((c) => [c.id, c]))
    const company = new Map((companies || []).map((c) => [c.id, c.name]))
    const cohort = new Map((cohorts || []).map((c) => [c.id, c.name]))
    const msgs = new Map<string, any[]>()
    for (const m of messages || []) msgs.set(m.ticket_id, [...(msgs.get(m.ticket_id) || []), m])
    const sorted = [...(tickets || [])].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1))
    return NextResponse.json({
      tickets: sorted.map((t) => {
        const c = client.get(t.client_id)
        return {
          ...t,
          client: c ? { id: c.id, name: c.name, email: c.email, company: c.company_id ? company.get(c.company_id) || null : null, cohort: c.cohort_id ? cohort.get(c.cohort_id) || null : null } : null,
          messages: msgs.get(t.id) || [],
        }
      }),
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
