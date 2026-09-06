import { NextRequest, NextResponse } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { AdminError } from '@/lib/admin/debrief'
import { logAdminAction } from '@/lib/admin/audit'
import { checkPdfBytes, createClientDocument, DocumentError } from '@/lib/documents/pipeline'
import { extractAssessment360, namesMatch } from '@/lib/documents/assessment-360'
import type { ExtractionStatus, PortalFeatures } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Every client document across portal users, for the review queue. Never
 * returns extracted text or structured data; never a personnel review's
 * existence beyond its status (a coach-invisible kind stays that way — the
 * supervisor sees the row for support purposes, not its content).
 */
export async function GET(req: NextRequest) {
  try {
    const { supabase } = await adminContext()
    const status = req.nextUrl.searchParams.get('status') || undefined
    let q = supabase
      .from('client_documents')
      .select('id, client_id, kind, title, size_bytes, extraction_status, extraction_error, uploader_role, visible_to_coach, assessment_date, instrument, format_version, supersedes_document_id, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (status) q = q.eq('extraction_status', status as ExtractionStatus)
    const { data: docs, error } = await q
    if (error) throw new AdminError(500, error.message)
    const ids = Array.from(new Set((docs || []).map((d) => d.client_id)))
    const { data: clients } = ids.length ? await supabase.from('clients').select('id, name, email, cohort_id, company_id').in('id', ids) : { data: [] }
    const byId = new Map((clients || []).map((c) => [c.id, c]))
    return NextResponse.json({
      documents: (docs || []).map((d) => ({ ...d, client: byId.get(d.client_id) || null })),
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}

/**
 * Bulk upload onto a cohort with the verification gate. Multipart: cohortId,
 * files[] (PDFs). Each file is read first; its participant name is matched
 * against the cohort's members — exactly one match files the report on that
 * client (confirmed by the match itself), anything else is HELD and returned
 * for a human to place by hand. Nothing becomes client-visible unless the
 * extraction completed on the matched client.
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, actor } = await adminContext()
    const form = await req.formData().catch(() => null)
    if (!form) throw new AdminError(400, 'Multipart form expected.')
    const cohortId = String(form.get('cohortId') || '')
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    if (!files.length) throw new AdminError(400, 'Choose at least one PDF.')
    if (files.length > 60) throw new AdminError(400, 'Upload at most 60 files per batch.')

    let members: Array<{ id: string; org_id: string; name: string; portal_features: PortalFeatures | null }> = []
    if (cohortId) {
      const { data } = await supabase.from('clients').select('id, org_id, name, portal_features').eq('cohort_id', cohortId)
      members = (data || []) as typeof members
      if (!members.length) throw new AdminError(400, 'That cohort has no participants yet — add them first so reports can be matched by name.')
    } else {
      const { data } = await supabase.from('clients').select('id, org_id, name, portal_features').or('client_type.eq.portal,portal_features->>assessments.eq.true')
      members = (data || []) as typeof members
    }

    const placed: Array<{ file: string; client_id: string; client_name: string; document_id: string; status: string }> = []
    const held: Array<{ file: string; reason: string; participant_name?: string; candidates?: string[] }> = []

    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer())
      try {
        checkPdfBytes(bytes, file.name)
      } catch (e) {
        held.push({ file: file.name, reason: e instanceof DocumentError ? e.message : 'not a usable PDF' })
        continue
      }
      const outcome = await extractAssessment360(new Uint8Array(bytes))
      if (outcome.status !== 'complete') {
        held.push({ file: file.name, reason: `${outcome.status}: ${outcome.error}` })
        continue
      }
      const name = outcome.data.participant_name
      const matches = members.filter((m) => namesMatch(name, m.name))
      if (matches.length !== 1) {
        held.push({
          file: file.name,
          participant_name: name,
          reason: matches.length === 0 ? 'no participant with that name in this cohort' : 'more than one participant matches that name',
          candidates: matches.map((m) => m.name),
        })
        continue
      }
      const target = matches[0]
      try {
        const result = await createClientDocument(
          supabase,
          { clientId: target.id, orgId: target.org_id, kind: 'assessment_360', bytes, filename: file.name, uploaderRole: 'coach', uploadedBy: actor.id, visibleToCoach: true },
          { confirmName: true }
        )
        placed.push({ file: file.name, client_id: target.id, client_name: target.name, document_id: result.document.id, status: result.document.extraction_status })
        if (result.document.extraction_status === 'complete') {
          const f = (target.portal_features || {}) as PortalFeatures
          if (!f.assessments) await supabase.from('clients').update({ portal_features: { ...f, assessments: true } }).eq('id', target.id)
        }
        await logAdminAction(supabase, { actorCoachId: actor.id, action: 'document_uploaded', targetClientId: target.id, detail: { document_id: result.document.id, status: result.document.extraction_status, bulk: true, cohort_id: cohortId || null } })
      } catch (e) {
        held.push({ file: file.name, participant_name: name, reason: e instanceof Error ? e.message : String(e) })
      }
    }
    return NextResponse.json({ placed, held })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
