import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

/** Edit a company's name / vision / values / notes. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const patch: Database['public']['Tables']['companies']['Update'] = { updated_at: new Date().toISOString() }
    for (const k of ['name', 'vision', 'values', 'notes'] as const) {
      if (k in body) (patch as Record<string, unknown>)[k] = body[k] === null ? null : String(body[k]).trim() || null
    }
    if ('name' in patch && !patch.name) throw new AdminError(400, 'Company name is required.')
    const { data, error } = await supabase.from('companies').update(patch).eq('id', params.id).select('*').maybeSingle()
    if (error) throw new AdminError(500, error.message)
    if (!data) throw new AdminError(404, 'Company not found.')
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: params.id, fields: Object.keys(patch) } })
    return NextResponse.json({ company: data })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
