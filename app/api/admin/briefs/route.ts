import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/** Every version of every brief (newest first). ?slug= to filter. */
export async function GET(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const slug = req.nextUrl.searchParams.get('slug') || undefined
    let q = supabase.from('prompt_briefs').select('*').eq('org_id', actor.org_id).order('slug').order('version', { ascending: false })
    if (slug) q = q.eq('slug', slug)
    const { data, error } = await q
    if (error) throw new AdminError(500, error.message)
    return NextResponse.json({ briefs: data || [] })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/**
 * Save a NEW version of a brief and make it the active one. Body: { slug,
 * title, body, activate? (default true) }. Old versions are kept — engagement
 * is comparable across versions via portal_messages.metadata. Effective on the
 * next chat message; no deploy.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const body = await req.json().catch(() => ({}))
    const slug = String(body.slug || 'assessment_360').trim()
    const title = String(body.title || '').trim()
    const text = String(body.body || '').trim()
    if (!/^[a-z0-9_]+$/.test(slug)) throw new AdminError(400, 'Slug must be lowercase letters, digits, and underscores.')
    if (!title) throw new AdminError(400, 'Title is required.')
    if (text.length < 40) throw new AdminError(400, 'The brief body is too short to be useful.')
    const activate = body.activate !== false

    const { data: latest } = await supabase.from('prompt_briefs').select('version').eq('org_id', actor.org_id).eq('slug', slug).order('version', { ascending: false }).limit(1).maybeSingle()
    const version = (latest?.version || 0) + 1
    if (activate) {
      const { error: deact } = await supabase.from('prompt_briefs').update({ is_active: false }).eq('org_id', actor.org_id).eq('slug', slug).eq('is_active', true)
      if (deact) throw new AdminError(500, deact.message)
    }
    const { data, error } = await supabase
      .from('prompt_briefs')
      .insert({ org_id: actor.org_id, slug, version, title, body: text, is_active: activate } as any)
      .select('*')
      .single()
    if (error || !data) throw new AdminError(500, error?.message || 'Could not save the brief.')
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'brief_version_created', detail: { slug, version, activated: activate } })
    return NextResponse.json({ brief: data }, { status: 201 })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
