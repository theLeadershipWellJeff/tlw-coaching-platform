import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/** Activate an existing version (roll back or forward). Exactly one active per slug. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const { data: brief } = await supabase.from('prompt_briefs').select('id, slug, version, org_id').eq('id', params.id).eq('org_id', actor.org_id).maybeSingle()
    if (!brief) throw new AdminError(404, 'Brief version not found.')
    const { error: deact } = await supabase.from('prompt_briefs').update({ is_active: false }).eq('org_id', actor.org_id).eq('slug', brief.slug).eq('is_active', true)
    if (deact) throw new AdminError(500, deact.message)
    const { error } = await supabase.from('prompt_briefs').update({ is_active: true }).eq('id', brief.id)
    if (error) throw new AdminError(500, error.message)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'brief_activated', detail: { slug: brief.slug, version: brief.version } })
    return NextResponse.json({ ok: true, active: { id: brief.id, slug: brief.slug, version: brief.version } })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
