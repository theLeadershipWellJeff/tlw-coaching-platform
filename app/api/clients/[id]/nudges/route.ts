import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, readJson } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { loadAppointmentContext, loadPdfNames } from '@/lib/nudges/enrich'

// A client's nudges for the workspace card — pending (draft/scheduled/snoozed) and
// recently sent, newest first. Skipped nudges are omitted. Rows carry the client's
// last/next appointment and the attached-PDF name (same shape as GET /api/nudges).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('nudges')
      .select(
        'id, client_id, type, origin, status, trigger_excerpt, rationale, draft_subject, draft_body, coach_note, pdf_resource_id, scheduled_for, sent_at, created_at'
      )
      .eq('client_id', params.id)
      .in('status', ['draft', 'scheduled', 'snoozed', 'sent'])
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data || []
    const [apptCtx, pdfNames] = await Promise.all([
      loadAppointmentContext(supabase, [params.id]),
      loadPdfNames(supabase, rows.map((n) => n.pdf_resource_id)),
    ])
    const ctx = apptCtx.get(params.id)

    return NextResponse.json({
      nudges: rows.map((n) => ({
        ...n,
        last_appointment_at: ctx?.last_appointment_at ?? null,
        next_appointment_at: ctx?.next_appointment_at ?? null,
        pdf_name: n.pdf_resource_id ? pdfNames.get(n.pdf_resource_id) || null : null,
      })),
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

const CreateSchema = z.object({
  type: z.enum(['action_checkin', 'insight', 'framework']),
  draft_subject: z.string().max(300).optional(),
  draft_body: z.string().max(8000).optional(),
  trigger_excerpt: z.string().max(2000).optional(),
  framework_slug: z.string().max(200).optional(),
})

// Manually create a nudge for a client (origin = 'manual'). The coach picks the
// type and supplies (or AI-drafts, then edits) the subject/body. Always lands as a
// draft for review — nothing sends here. A framework nudge inherits the leaf's
// standing PDF attachment (garden_notes.pdf_resource_id), editable in the queue.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const body = await readJson(req, CreateSchema)

    const frameworkSlug = body.type === 'framework' ? body.framework_slug?.trim() || null : null
    let pdfResourceId: string | null = null
    if (frameworkSlug) {
      const { data: leaf } = await supabase
        .from('garden_notes')
        .select('pdf_resource_id')
        .eq('coach_id', coach.id)
        .eq('id', frameworkSlug)
        .maybeSingle()
      pdfResourceId = leaf?.pdf_resource_id ?? null
    }

    const { data, error } = await supabase
      .from('nudges')
      .insert({
        coach_id: coach.id,
        client_id: params.id,
        source_session_id: null,
        type: body.type,
        origin: 'manual',
        trigger_excerpt: body.trigger_excerpt?.trim() || null,
        rationale: null,
        framework_slug: frameworkSlug,
        pdf_resource_id: pdfResourceId,
        draft_subject: body.draft_subject?.trim() || null,
        draft_body: body.draft_body?.trim() || null,
        status: 'draft',
      })
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ nudge: data }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
