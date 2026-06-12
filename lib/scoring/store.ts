/**
 * Score a stored transcript and persist the report.
 *
 * Shared by the ingest webhook (auto-score on a confident match) and the
 * manual flows (assign a needs-review transcript, or re-score). The transcript
 * row is the source of truth for session metadata; the engine fills in the rest.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, SessionReport, Transcript } from '@/lib/supabase/types'
import { scoreTranscript, type ScoringContext } from './engine'
import { parseTranscript } from '@/lib/transcripts/parse'

export async function runAndStoreReport(
  supabase: SupabaseClient<Database>,
  transcript: Transcript,
  coachName: string
): Promise<SessionReport> {
  const parsed = parseTranscript(transcript.filename, transcript.raw_md)

  const ctx: ScoringContext = {
    coachName,
    clientInitials: transcript.client_initials || parsed.clientInitials || '—',
    sessionType: parsed.sessionType,
    sessionNumber: parsed.sessionNumber,
    engagementTotal: parsed.engagementTotal,
    sessionDate: transcript.session_date || parsed.sessionDate || new Date().toISOString().slice(0, 10),
  }

  // Feed the transcript body (front matter stripped) to the engine.
  const report = await scoreTranscript(parsed.body || transcript.raw_md, ctx)

  const row: Database['public']['Tables']['session_reports']['Insert'] = {
    transcript_id: transcript.id,
    coach_id: transcript.coach_id,
    client_id: transcript.client_id,
    client_initials: ctx.clientInitials,
    session_date: ctx.sessionDate,
    session_type: report.session.type || null,
    session_number: report.session.session_number,
    engagement_total: report.session.engagement_total,
    overall_score: report.overall_score,
    band: report.band,
    report,
    status: 'scored',
  }

  // One report per transcript — upsert so a re-score replaces the prior one.
  const { data, error } = await supabase
    .from('session_reports')
    .upsert(row, { onConflict: 'transcript_id' })
    .select('*')
    .single()
  if (error) throw new Error(`Supabase (session_reports upsert): ${error.message}`)
  return data
}
