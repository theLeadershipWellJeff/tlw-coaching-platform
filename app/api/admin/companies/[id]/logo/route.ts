import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { readLogoFile, removeCompanyLogo, saveCompanyLogo } from '@/lib/portal/branding'

export const runtime = 'nodejs'

/** The company's logo image (for the Command Center preview). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await adminContext()
    const { data } = await supabase.from('companies').select('logo_path, logo_content_type').eq('id', params.id).maybeSingle()
    if (!data?.logo_path) return new NextResponse(null, { status: 404 })
    const file = await readLogoFile(supabase, data.logo_path, data.logo_content_type ?? null)
    if (!file) return new NextResponse(null, { status: 404 })
    return new NextResponse(file.bytes, {
      headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/** Upload / replace the company's co-branding logo. Multipart: file (PNG/JPEG/WebP, ≤1 MB). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw new AdminError(400, 'Choose an image to upload.')
    const result = await saveCompanyLogo(supabase, params.id, { bytes: Buffer.from(await file.arrayBuffer()), type: file.type })
    if (!result.ok) throw new AdminError(result.status, result.error)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: params.id, fields: ['logo'] } })
    return NextResponse.json({ logo_updated_at: result.logo_updated_at })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/** Remove the logo — the portal goes back to plain theLeadershipWell branding. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, actor } = await adminContext()
    await removeCompanyLogo(supabase, params.id)
    await logAdminAction(supabase, { actorCoachId: actor.id, action: 'company_updated', detail: { company_id: params.id, fields: ['logo_removed'] } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
