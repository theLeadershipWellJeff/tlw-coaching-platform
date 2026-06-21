import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, readJson, ApiError } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { draftNudge } from '@/lib/nudges/draft'

export const runtime = 'nodejs'
export const maxDuration = 60

const Schema = z.object({
  // AI assist supports the two grounded types; framework drafting waits for the
  // vault (Phase B), so the coach writes those by hand.
  type: z.enum(['action_checkin', 'insight']),
  // The action description or insight line to build the message around.
  trigger_excerpt: z.string().min(1).max(2000),
})

// AI-draft a single manual nudge in the coach's voice from a chosen anchor
// (an open action, or a captured insight). Returns { subject, body } WITHOUT
// persisting — the modal previews it, the coach edits, then creates.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const body = await readJson(req, Schema)

    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) throw new ApiError(404, 'Client not found')

    const firstName = client.name.split(/\s+/)[0] || client.name
    const draft = await draftNudge({
      clientFirstName: firstName,
      candidate: {
        type: body.type,
        origin: 'manual',
        trigger_excerpt: body.trigger_excerpt,
        rationale: '',
        action_description: body.type === 'action_checkin' ? body.trigger_excerpt : undefined,
      },
    })
    if (!draft) throw new ApiError(502, 'Could not draft a nudge — try again.')

    return NextResponse.json(draft)
  } catch (e) {
    return toErrorResponse(e)
  }
}
