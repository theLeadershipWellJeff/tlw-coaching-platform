/**
 * Prep Sheet Pipeline — the generation job. Runs as a branch inside the hourly
 * reminders cron (no new vercel.json entry). Once a day, at each coach's
 * configured review_hour, it drafts prep sheets for their upcoming sessions and
 * emails them one review digest.
 *
 * Selection → eligibility gate → generate (reusing lib/prep-sheets/content.ts) →
 * write the draft/skip/failed row → claim + send the coach digest. Every step is
 * best-effort and isolated: one coach's failure never aborts the others, and one
 * appointment's generation failure never blocks the rest.
 *
 * KEY-INFO WALL: every client read here is an explicit column list; key_info is
 * never selected. The history gather (history.ts) enforces the same.
 */
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { getBaseUrl } from '@/lib/url'
import { buildClientEmailHTML } from '@/lib/email-template'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { formatWhenInTimeZone } from '@/lib/datetime'
import { normalizePrepSheetSettings, type PrepSheetSettings } from './settings'
import { gatherClientHistory } from './history'
import { generatePrepContent } from './content'
import { computeDeliveryPlan } from './schedule'
import {
  buildPrepReviewEmailHTML,
  prepReviewSubject,
  type PrepReviewDraft,
  type PrepReviewIneligible,
} from './review-email'

const DAY_MS = 24 * 60 * 60 * 1000
const FALLBACK_TZ = process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'
const PREP_SUBJECT = 'Your Session Preparation - theLeadershipWell'

export type PrepGenerationSummary = {
  coachesProcessed: number
  drafted: number
  skipped: number
  failed: number
  digestsSent: number
}

/** The hour (0–23) as read on a clock in `timeZone`. */
function hourInTimeZone(at: Date, timeZone: string): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at)
  return Number(s) % 24
}

type ClientLite = { id: string; name: string; email: string | null; timezone: string | null }
type CandidateAppt = { id: string; client_id: string; scheduled_at: string; duration_minutes: number }

// Internal per-appointment outcome, carrying the appointment id so the digest can
// be filtered to the rows we actually claimed this tick.
type Outcome =
  | { appointmentId: string; draft: PrepReviewDraft }
  | { appointmentId: string; ineligible: PrepReviewIneligible }

/** Build the interactive "build this by hand" link (the session prep page reads
 *  these query params; the [id] segment is ignored). */
function manualBuildUrl(base: string, client: ClientLite, appt: CandidateAppt): string {
  const qs = new URLSearchParams({
    clientName: client.name,
    clientEmail: client.email || '',
    start: appt.scheduled_at,
    duration: String(appt.duration_minutes || 55),
  })
  return `${base}/session/manual?${qs.toString()}`
}

async function processAppointment(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  settings: PrepSheetSettings,
  appt: CandidateAppt,
  client: ClientLite,
  coachTz: string,
  base: string,
  now: Date
): Promise<Outcome | null> {
  const clientTz = client.timezone || coachTz
  const sessionStart = new Date(appt.scheduled_at)
  const plan = computeDeliveryPlan(sessionStart, settings, clientTz)
  const whenLabel = formatWhenInTimeZone(sessionStart, coachTz)
  const deliveryLabel = formatWhenInTimeZone(plan.at, clientTz)

  const history = await gatherClientHistory(supabase, client.id, settings.history_window_days)

  // Ineligible → record a no_history skip, do not generate. A prep sheet built
  // with no history is generic filler; nothing is worse than that except sending it.
  if (!history.eligible) {
    const { error } = await supabase.from('prep_sheet_pipeline').insert({
      coach_id: coach.id,
      client_id: client.id,
      appointment_id: appt.id,
      status: 'skipped',
      skip_reason: 'no_history',
      skipped_at: now.toISOString(),
      scheduled_send_at: plan.at.toISOString(),
      eligibility: history.eligibility,
    })
    if (error) {
      // Unique conflict = a row appeared since our filter; leave it be.
      console.error('[prep-gen] skip insert failed', { appointmentId: appt.id, error: error.message })
      return null
    }
    return {
      appointmentId: appt.id,
      ineligible: { clientName: client.name, whenLabel, buildUrl: manualBuildUrl(base, client, appt), reason: 'no_history' },
    }
  }

  // Eligible → generate. A generation failure writes status='failed' and surfaces
  // in the digest + /prep, but never aborts the loop for the other appointments.
  try {
    const { content, model } = await generatePrepContent({
      clientName: client.name,
      clientId: client.id,
      notes: history.notes,
    })
    const bodyHtml = buildClientEmailHTML(client.name, content)
    const skipToken = randomUUID()
    const { data: row, error } = await supabase
      .from('prep_sheet_pipeline')
      .insert({
        coach_id: coach.id,
        client_id: client.id,
        appointment_id: appt.id,
        status: 'draft',
        subject: PREP_SUBJECT,
        body_html: bodyHtml,
        generated_at: now.toISOString(),
        generation_model: model,
        eligibility: history.eligibility,
        scheduled_send_at: plan.at.toISOString(),
        skip_token: skipToken,
      })
      .select('id')
      .single()
    if (error || !row) {
      console.error('[prep-gen] draft insert failed', { appointmentId: appt.id, error: error?.message })
      return null
    }
    return {
      appointmentId: appt.id,
      draft: {
        clientName: client.name,
        whenLabel,
        deliveryLabel,
        reviewUrl: `${base}/prep?focus=${row.id}`,
        skipUrl: `${base}/api/prep-sheets/skip?token=${skipToken}`,
        shortNotice: plan.clamped,
      },
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[prep-gen] generation failed', { appointmentId: appt.id, detail })
    await supabase.from('prep_sheet_pipeline').insert({
      coach_id: coach.id,
      client_id: client.id,
      appointment_id: appt.id,
      status: 'failed',
      error_detail: detail.slice(0, 500),
      scheduled_send_at: plan.at.toISOString(),
      eligibility: history.eligibility,
    })
    return {
      appointmentId: appt.id,
      ineligible: { clientName: client.name, whenLabel, buildUrl: manualBuildUrl(base, client, appt), reason: 'failed' },
    }
  }
}

async function runForCoach(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  settings: PrepSheetSettings,
  now: Date,
  summary: PrepGenerationSummary
): Promise<void> {
  const coachTz = coach.timezone || FALLBACK_TZ
  const base = getBaseUrl()
  const windowEnd = new Date(now.getTime() + settings.generate_lead_days * DAY_MS).toISOString()

  // Candidate sessions: this coach's scheduled, client-matched appointments
  // starting within the generate lead and still in the future. Source-agnostic —
  // native, Calendly, HubSpot all qualify.
  const { data: appts } = await supabase
    .from('appointments')
    .select('id, client_id, scheduled_at, duration_minutes, status')
    .eq('coach_id', coach.id)
    .eq('status', 'scheduled')
    .not('client_id', 'is', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', windowEnd)
  if (!appts || appts.length === 0) return

  // Skip appointments that already have a pipeline row (dedupe).
  const apptIds = appts.map((a) => a.id)
  const { data: existing } = await supabase
    .from('prep_sheet_pipeline')
    .select('appointment_id')
    .in('appointment_id', apptIds)
  const have = new Set((existing || []).map((e) => e.appointment_id))
  const candidates = appts.filter((a) => !have.has(a.id)) as (CandidateAppt & { client_id: string })[]
  if (candidates.length === 0) return

  // Load the clients — explicit columns only (no key_info).
  const clientIds = Array.from(new Set(candidates.map((a) => a.client_id)))
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, email, timezone')
    .in('id', clientIds)
  const clientMap = new Map((clientRows || []).map((c) => [c.id, c as ClientLite]))

  const outcomes: Outcome[] = []
  for (const appt of candidates) {
    const client = clientMap.get(appt.client_id)
    if (!client) continue
    try {
      const outcome = await processAppointment(supabase, coach, settings, appt, client, coachTz, base, now)
      if (!outcome) continue
      outcomes.push(outcome)
      if ('draft' in outcome) summary.drafted++
      else if (outcome.ineligible.reason === 'failed') summary.failed++
      else summary.skipped++
    } catch (e) {
      console.error('[prep-gen] appointment errored', { appointmentId: appt.id, error: e })
    }
  }
  if (outcomes.length === 0) return

  // Claim the (appointment_id, 'prep_review') slot for each processed appointment
  // before sending — mirrors the reminder claim so the digest can't fire twice.
  // Only newly-claimed appointments go into the email; a claim conflict means the
  // digest already covered it.
  const claimed = new Set<string>()
  for (const o of outcomes) {
    const { error } = await supabase
      .from('appointment_reminders')
      .insert({ appointment_id: o.appointmentId, kind: 'prep_review', sent_at: now.toISOString() })
    if (!error) claimed.add(o.appointmentId)
  }
  const sendable = outcomes.filter((o) => claimed.has(o.appointmentId))
  if (sendable.length === 0) return

  const drafts = sendable.filter((o): o is Extract<Outcome, { draft: PrepReviewDraft }> => 'draft' in o).map((o) => o.draft)
  const ineligible = sendable
    .filter((o): o is Extract<Outcome, { ineligible: PrepReviewIneligible }> => 'ineligible' in o)
    .map((o) => o.ineligible)

  const subject = prepReviewSubject(drafts.length, ineligible.length)
  const html = buildPrepReviewEmailHTML({ coachName: coach.name, drafts, ineligible })

  // Coach-to-self operational mail: NO server-side signature, and deliberately
  // NO communications row — logging it would pollute the client communications
  // log and trip the nudge spacing rule (lib/nudges/send.ts), silently
  // suppressing legitimate client nudges. Do not "fix" this by logging it.
  const to = coach.email
  const ok = to ? await sendCoachHtmlEmail(coach, { to, subject, html }).catch(() => false) : false
  if (ok) {
    summary.digestsSent++
  } else {
    // Roll the claims back so the next cron run retries the digest.
    await supabase
      .from('appointment_reminders')
      .delete()
      .in('appointment_id', Array.from(claimed))
      .eq('kind', 'prep_review')
  }
}

/**
 * Regenerate one prep sheet in place (the /prep "Regenerate" action). Re-gathers
 * history, re-runs the generator, and resets the row to `draft` — clearing any
 * approval/skip/error state (an edited or refreshed sheet must be re-approved).
 * Returns a reason when there's no history to generate from.
 */
export async function regeneratePrepSheet(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  sheet: { id: string; client_id: string; appointment_id: string; skip_token: string | null }
): Promise<{ ok: boolean; reason?: string }> {
  const settings = normalizePrepSheetSettings(coach.reminder_settings)
  const coachTz = coach.timezone || FALLBACK_TZ
  const now = new Date().toISOString()

  const { data: appt } = await supabase
    .from('appointments')
    .select('scheduled_at')
    .eq('id', sheet.appointment_id)
    .maybeSingle()
  if (!appt) return { ok: false, reason: 'The session for this prep sheet no longer exists.' }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, timezone')
    .eq('id', sheet.client_id)
    .maybeSingle()
  if (!client) return { ok: false, reason: 'Client not found.' }

  const history = await gatherClientHistory(supabase, client.id, settings.history_window_days)
  if (!history.eligible) {
    return { ok: false, reason: 'No recent notes or transcripts to generate from.' }
  }

  let content
  let model: string
  try {
    const res = await generatePrepContent({ clientName: client.name, clientId: client.id, notes: history.notes })
    content = res.content
    model = res.model
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `Generation failed: ${detail}`.slice(0, 300) }
  }

  const clientTz = client.timezone || coachTz
  const plan = computeDeliveryPlan(new Date(appt.scheduled_at), settings, clientTz)
  const bodyHtml = buildClientEmailHTML(client.name, content)

  const { error } = await supabase
    .from('prep_sheet_pipeline')
    .update({
      status: 'draft',
      subject: PREP_SUBJECT,
      body_html: bodyHtml,
      generated_at: now,
      generation_model: model,
      eligibility: history.eligibility,
      scheduled_send_at: plan.at.toISOString(),
      // Refreshed content must be re-approved; clear any prior terminal state.
      approved_at: null,
      skipped_at: null,
      skip_reason: null,
      error_detail: null,
      skip_token: sheet.skip_token || randomUUID(),
      updated_at: now,
    })
    .eq('id', sheet.id)
    .eq('coach_id', coach.id)
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

/**
 * Entry point (called from the reminders cron). Iterates coaches whose prep
 * pipeline is enabled and whose local hour matches their review_hour.
 */
export async function runPrepGeneration(
  supabase: SupabaseClient<Database>,
  now: Date = new Date()
): Promise<PrepGenerationSummary> {
  const summary: PrepGenerationSummary = { coachesProcessed: 0, drafted: 0, skipped: 0, failed: 0, digestsSent: 0 }

  const { data: coaches } = await supabase.from('coaches').select('*')
  for (const coach of (coaches || []) as Coach[]) {
    try {
      const settings = normalizePrepSheetSettings(coach.reminder_settings)
      if (!settings.enabled) continue
      const tz = coach.timezone || FALLBACK_TZ
      if (hourInTimeZone(now, tz) !== settings.review_hour) continue
      summary.coachesProcessed++
      await runForCoach(supabase, coach, settings, now, summary)
    } catch (e) {
      console.error('[prep-gen] coach errored', { coachId: coach.id, error: e })
    }
  }
  return summary
}
