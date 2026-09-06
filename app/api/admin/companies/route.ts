import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { seatsActivated, AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/** Companies with their cohorts, seats purchased vs activated. Supervisor-only. */
export async function GET() {
  try {
    const { supabase } = await adminContext()
    const [{ data: companies }, { data: cohorts }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('cohorts').select('*').order('created_at', { ascending: false }),
    ])
    const activated = await seatsActivated(supabase, (cohorts || []).map((c) => c.id))
    return NextResponse.json({
      companies: (companies || []).map((co) => ({
        ...co,
        cohorts: (cohorts || [])
          .filter((c) => c.company_id === co.id)
          .map((c) => ({ ...c, seats_activated: activated[c.id] || 0 })),
      })),
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/** Create a company. Body: { name, vision?, values?, notes? }. */
export async function POST(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const name = String(body.name || '').trim()
    if (!name) throw new AdminError(400, 'Company name is required.')
    const { data, error } = await supabase
      .from('companies')
      .insert({ org_id: actor.org_id, name, vision: body.vision || null, values: body.values || null, notes: body.notes || null } as any)
      .select('*')
      .single()
    if (error || !data) throw new AdminError(500, error?.message || 'Could not create the company.')
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_created', detail: { company_id: data.id, name } })
    return NextResponse.json({ company: data }, { status: 201 })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
