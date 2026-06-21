/**
 * Score a stored transcript and persist the report.
 *
 * Shared by the ingest webhook (auto-score on a confident match) and the
 * manual flows (assign a needs-review transcript, or re-score). The transcript
 * row is the source of truth for session metadata; the engine fills in the rest.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database, SessionReport, Transcript } from '@/lib/supabase/types'
import { scoreTranscript, type ScoringContext } from './engine'
import { parseTranscript } from '@/lib/transcripts/parse'
import { sendScorecardEmail } from '@/lib/scorecard-email'
import { todayInTimeZone } from '@/lib/datetime'
import { DEFAULT_TIMEZONE } from '@/lib/coach'
import { generateNudgesForClient } from '@/lib/nudges/generate'

export async function runAndStoreReport(
  supabase: SupabaseClient<Database>,
  transcript: Transcript,
  coach: Coach,
  opts: { sendEmail?: boolean } = {}
): Promise<SessionReport> {
  const sendEmail = opts.sendEmail ?? true
  const parsed = parseTranscript(transcript.filename, transcript.raw_md)

  // Competency 1 disclosure gate (spec v0.4 §9 C1). The client record is the
  // source of truth (migration 018): agreement_on_file = a signed coaching
  // agreement exists; recording_authorized = the client's explicit AI/recording
  // decision (true = consented, false = declined, null = legacy/unknown). A
  // signed agreement is the controlling document, so consent is "on file" unless
  // the client explicitly declined recording. An unmatched transcript (no
  // client_id) falls back to false → the engine looks for verbal consent instead.
  let agreementOnFile = false
  let recordingAuthorized: boolean | null = null
  if (transcript.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('agreement_on_file, recording_authorized')
      .eq('id', transcript.client_id)
      .maybeSingle()
    agreementOnFile = !!client?.agreement_on_file
    recordingAuthorized = client?.recording_authorized ?? null
  }

  const ctx: ScoringContext = {
    coachName: coach.name,
    clientInitials: transcript.client_initials || parsed.clientInitials || '—',
    sessionType: parsed.sessionType,
    sessionNumber: parsed.sessionNumber,
    engagementTotal: parsed.engagementTotal,
    // Fall back to today *in the coach's timezone* — never the server's UTC date,
    // which lands an evening Pacific session on the next day.
    sessionDate:
      transcript.session_date ||
      parsed.sessionDate ||
      todayInTimeZone(coach.timezone || DEFAULT_TIMEZONE),
    agreementOnFile,
    recordingAuthorized,
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

  // Draft between-session nudges from this session (Phase A). Best-effort and
  // never auto-sent — drafts land in the coach's Nudge Queue for review. A failure
  // here must never fail scoring. Skipped on a rescore (opts.sendEmail === false)
  // so re-running the engine doesn't re-propose nudges. Needs a matched client.
  if (sendEmail && transcript.client_id && transcript.coach_id) {
    try {
      await generateNudgesForClient(supabase, {
        clientId: transcript.client_id,
        coachId: transcript.coach_id,
        sourceSessionId: transcript.id,
      })
    } catch (e: any) {
      console.error('Nudge generation failed:', e?.message || e)
    }
  }

  // Email the coach their scorecard (roadmap: emailed scorecard). Best-effort —
  // a send failure must never fail scoring. Disable with EMAIL_SCORECARD=false,
  // or per-call via opts.sendEmail (a manual rescore shouldn't re-notify).
  if (sendEmail && process.env.EMAIL_SCORECARD !== 'false') {
    try {
      await sendScorecardEmail(coach, report)
    } catch (e: any) {
      console.error('Scorecard email failed:', e?.message || e)
    }
  }

  return data
}
