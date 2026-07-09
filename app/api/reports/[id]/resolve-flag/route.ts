/**
 * POST /api/reports/[id]/resolve-flag
 * Body: { flag: string, note?: string, undo?: boolean }
 *
 * Marks one v0.5.2 Layer-0 manual-review flag as reviewed by the coach. The
 * resolution is written into report.integrity.resolutions (inside the report
 * jsonb) — the flag itself stays listed for audit, the UI renders it resolved.
 * Resolving the speaker-reassignment flag also sets confirmed=true on every
 * reassignment (the human confirmation L0.1 asks for); undo restores
 * confirmed=false.
 *
 * A rescore replaces the report jsonb and regenerates the flags, so
 * resolutions reset with it — new machine output needs a fresh review.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import type { FlagResolution, SessionReportJson } from '@/lib/scoring/types'

export const runtime = 'nodejs'

const KNOWN_FLAGS = new Set([
  'speaker_reassignment_unconfirmed',
  'evidence_verbatim_failed',
  'low_attribution_confidence',
  'likely_speaker_swap',
  'recording_consent_needs_confirmation',
  // v0.5.3 contracting / session-number fail-loud flags
  'session_number_uncertain',
  'contracting_classification_unclear',
])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const flag = body?.flag
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const undo = body?.undo === true
  if (typeof flag !== 'string' || !KNOWN_FLAGS.has(flag))
    return NextResponse.json({ error: 'Unknown flag' }, { status: 400 })

  const { data: row, error: fetchErr } = await supabase
    .from('session_reports')
    .select('id, report')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const report = row.report as SessionReportJson
  const integrity = report?.integrity
  if (!integrity || !integrity.flags_for_manual_review?.includes(flag))
    return NextResponse.json({ error: 'That flag is not present on this report' }, { status: 409 })

  const resolutions: Record<string, FlagResolution> = { ...(integrity.resolutions ?? {}) }
  let reassignments = integrity.speaker_reassignments ?? []

  if (undo) {
    delete resolutions[flag]
    if (flag === 'speaker_reassignment_unconfirmed') {
      reassignments = reassignments.map((r) => ({ ...r, confirmed: false }))
    }
  } else {
    resolutions[flag] = {
      action: 'confirmed',
      ...(note ? { note } : {}),
      resolved_at: new Date().toISOString(),
      resolved_by: coach.email,
    }
    if (flag === 'speaker_reassignment_unconfirmed') {
      reassignments = reassignments.map((r) => ({ ...r, confirmed: true }))
    }
  }

  const updatedReport: SessionReportJson = {
    ...report,
    integrity: { ...integrity, speaker_reassignments: reassignments, resolutions },
  }

  const { data, error } = await supabase
    .from('session_reports')
    .update({ report: updatedReport as any, updated_at: new Date().toISOString() } as any)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select('*')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ report: data })
}
