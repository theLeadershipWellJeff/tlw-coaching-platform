import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, readJson, toErrorResponse } from '@/lib/api-handler'
import { getOrCreateAgreementTemplate } from '@/lib/agreement-store'

export const runtime = 'nodejs'

// GET — the coach's master agreement template (get-or-create, seeded on first use).
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const template = await getOrCreateAgreementTemplate(supabase, coach)
    return NextResponse.json({ template })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Only the editable sections are accepted; locked sections are never updated here.
const SaveSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description_of_coaching: z.string(),
  agreement_logistics: z.string(),
  method_of_contact: z.string(),
  late_policy: z.string(),
  cancellation_policy: z.string(),
  payment_terms: z.string().nullable().optional(),
})

// PUT — save edits to the editable sections of the master template.
export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await readJson(req, SaveSchema)
    // Ensure the row exists (and belongs to this coach) before updating.
    const template = await getOrCreateAgreementTemplate(supabase, coach)

    const { data, error } = await supabase
      .from('agreement_templates')
      .update({
        name: body.name ?? template.name,
        description_of_coaching: body.description_of_coaching,
        agreement_logistics: body.agreement_logistics,
        method_of_contact: body.method_of_contact,
        late_policy: body.late_policy,
        cancellation_policy: body.cancellation_policy,
        payment_terms: body.payment_terms ?? null,
      })
      .eq('id', template.id)
      .eq('coach_id', coach.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ template: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
