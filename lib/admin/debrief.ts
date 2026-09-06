/**
 * Command-center operations for the assessment debrief add-on (Phase 4).
 * Supervisor-only callers (the /api/admin/* routes gate with requireSupervisor).
 *
 * House-coach ownership (build prompt §7): every portal participant carries a
 * coach_clients link to the house coach (DEFAULT_COACH_EMAIL) so every existing
 * tenant gate keeps working; the roster filters them out by client_type.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database, PortalFeatures } from '@/lib/supabase/types'
import { linkCoachToClient } from '@/lib/client-access'
import { loadPortalStates, type ClientPortalState } from '@/lib/admin/portal-status'
import { createLoginToken, recentLoginTokenCount, MAX_LINKS_PER_HOUR } from '@/lib/portal/tokens'
import { sendPortalLoginEmail } from '@/lib/portal/send'
import { getBaseUrl } from '@/lib/url'

export class AdminError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AdminError'
  }
}

/** The coach every portal participant is linked to. */
export async function resolveHouseCoach(supabase: SupabaseClient<Database>, fallback: Coach): Promise<Coach> {
  const email = (process.env.DEFAULT_COACH_EMAIL || '').trim().toLowerCase()
  if (email) {
    const { data } = await supabase.from('coaches').select('*').eq('email', email).maybeSingle()
    if (data) return data as Coach
  }
  return fallback
}

/**
 * Which portal use case a client is:
 *  - coaching:    a coaching client using the general portal (flag off)
 *  - coaching_zf: a coaching client with the 360 switched on
 *  - standalone:  a portal-only participant with no company/cohort
 *  - enterprise:  a portal-only participant bought by a company (company or cohort set)
 */
export type PortalUserKind = 'coaching' | 'coaching_zf' | 'standalone' | 'enterprise'

export type PortalUserRow = {
  id: string
  name: string
  email: string | null
  client_type: string
  kind: PortalUserKind
  status: string
  company_id: string | null
  company_name: string | null
  cohort_id: string | null
  cohort_name: string | null
  portal_features: PortalFeatures
  assessments_enabled: boolean
  portal_access_expires_at: string | null
  created_at: string
  portal: ClientPortalState
  document: { id: string; extraction_status: string; extraction_error: string | null; assessment_date: string | null } | null
  document_count: number
  engagement: { chat_messages: number; goals_created: number; downloads: number; last_event_at: string | null; talk_to_coach_clicks: number }
  has_coach_relationship: boolean
}

/**
 * Portal users across every use case: portal-only participants (client_type
 * 'portal'), coaching clients with the 360 switched on, and coaching clients
 * who have ever been invited to the portal. Separate from the coaching roster.
 */
export async function listPortalUsers(supabase: SupabaseClient<Database>, opts: { cohortId?: string; companyId?: string; kind?: PortalUserKind } = {}): Promise<PortalUserRow[]> {
  // Coaching clients count as portal users once a sign-in link has been minted.
  const { data: invited } = await supabase.from('client_tokens').select('client_id').eq('purpose', 'login')
  const invitedIds = Array.from(new Set((invited || []).map((t) => t.client_id)))
  const filters = ['client_type.eq.portal', 'portal_features->>assessments.eq.true']
  if (invitedIds.length) filters.push(`id.in.(${invitedIds.join(',')})`)
  let q = supabase
    .from('clients')
    .select('id, name, email, client_type, status, company_id, cohort_id, portal_features, portal_access_expires_at, created_at')
    .or(filters.join(','))
    .neq('client_type', 'coach')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (opts.cohortId) q = q.eq('cohort_id', opts.cohortId)
  if (opts.companyId) q = q.eq('company_id', opts.companyId)
  const { data: rows, error } = await q
  if (error) throw new AdminError(500, error.message)
  let clients = rows || []
  const kindOf = (c: { client_type: string; company_id: string | null; cohort_id: string | null; portal_features: unknown }): PortalUserKind => {
    const f = (c.portal_features || {}) as PortalFeatures
    if (c.client_type === 'portal') return c.company_id || c.cohort_id ? 'enterprise' : 'standalone'
    return f.assessments === true ? 'coaching_zf' : 'coaching'
  }
  if (opts.kind) clients = clients.filter((c) => kindOf(c) === opts.kind)
  if (!clients.length) return []
  const ids = clients.map((c) => c.id)

  const [states, { data: docs }, { data: events }, { data: companies }, { data: cohorts }] = await Promise.all([
    loadPortalStates(supabase, ids),
    supabase
      .from('client_documents')
      .select('id, client_id, extraction_status, extraction_error, assessment_date, kind, created_at')
      .in('client_id', ids)
      .eq('kind', 'assessment_360')
      .order('assessment_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('portal_events').select('client_id, event_type, created_at').in('client_id', ids).order('created_at', { ascending: false }).limit(5000),
    supabase.from('companies').select('id, name'),
    supabase.from('cohorts').select('id, name'),
  ])
  const companyName = new Map((companies || []).map((c) => [c.id, c.name]))
  const cohortName = new Map((cohorts || []).map((c) => [c.id, c.name]))
  const latestDoc = new Map<string, NonNullable<typeof docs>[number]>()
  const docCount = new Map<string, number>()
  for (const d of docs || []) {
    docCount.set(d.client_id, (docCount.get(d.client_id) || 0) + 1)
    if (!latestDoc.has(d.client_id)) latestDoc.set(d.client_id, d)
  }
  const eng = new Map<string, PortalUserRow['engagement']>()
  for (const e of events || []) {
    const cur = eng.get(e.client_id) || { chat_messages: 0, goals_created: 0, downloads: 0, last_event_at: null, talk_to_coach_clicks: 0 }
    if (!cur.last_event_at) cur.last_event_at = e.created_at
    if (e.event_type === 'chat_message') cur.chat_messages++
    if (e.event_type === 'goal_created') cur.goals_created++
    if (e.event_type === 'document_downloaded' || e.event_type === 'report_viewed') cur.downloads++
    if (e.event_type === 'talk_to_coach_clicked') cur.talk_to_coach_clicks++
    eng.set(e.client_id, cur)
  }

  return clients.map((c) => {
    const f = (c.portal_features || {}) as PortalFeatures
    const d = latestDoc.get(c.id)
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      client_type: c.client_type,
      kind: kindOf(c),
      status: c.status,
      company_id: c.company_id,
      company_name: c.company_id ? companyName.get(c.company_id) || null : null,
      cohort_id: c.cohort_id,
      cohort_name: c.cohort_id ? cohortName.get(c.cohort_id) || null : null,
      portal_features: f,
      assessments_enabled: f.assessments === true,
      portal_access_expires_at: c.portal_access_expires_at,
      created_at: c.created_at,
      portal: states[c.id],
      document: d ? { id: d.id, extraction_status: d.extraction_status, extraction_error: d.extraction_error, assessment_date: d.assessment_date } : null,
      document_count: docCount.get(c.id) || 0,
      engagement: eng.get(c.id) || { chat_messages: 0, goals_created: 0, downloads: 0, last_event_at: null, talk_to_coach_clicks: 0 },
      has_coach_relationship: c.client_type !== 'portal',
    }
  })
}

/** Create a standalone portal participant, linked to the house coach. */
export async function createPortalParticipant(
  supabase: SupabaseClient<Database>,
  actor: Coach,
  input: { name: string; email: string; companyId?: string | null; cohortId?: string | null; enableAssessments?: boolean }
): Promise<{ id: string }> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) throw new AdminError(400, 'Name is required.')
  if (!email || !email.includes('@')) throw new AdminError(400, 'A valid email is required.')
  const { data: dup } = await supabase.from('clients').select('id, name').ilike('email', email).maybeSingle()
  if (dup) throw new AdminError(409, `A client with that email already exists (${dup.name}).`)

  let expires: string | null = null
  let companyId = input.companyId || null
  if (input.cohortId) {
    const { data: cohort } = await supabase.from('cohorts').select('id, company_id, access_expires_at').eq('id', input.cohortId).maybeSingle()
    if (!cohort) throw new AdminError(404, 'Cohort not found.')
    expires = cohort.access_expires_at
    companyId = companyId || cohort.company_id
  }
  const house = await resolveHouseCoach(supabase, actor)
  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      name,
      email,
      status: 'active',
      client_type: 'portal',
      company_id: companyId,
      cohort_id: input.cohortId || null,
      portal_features: { assessments: input.enableAssessments !== false },
      portal_access_expires_at: expires,
      org_id: house.org_id ?? undefined,
    } as any)
    .select('id')
    .single()
  if (error || !created) throw new AdminError(500, error?.message || 'Could not create the participant.')
  await linkCoachToClient(supabase, house.id, created.id, 'primary')
  return { id: created.id }
}

export async function seatsActivated(supabase: SupabaseClient<Database>, cohortIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!cohortIds.length) return out
  const { data } = await supabase.from('clients').select('cohort_id').in('cohort_id', cohortIds)
  for (const r of data || []) if (r.cohort_id) out[r.cohort_id] = (out[r.cohort_id] || 0) + 1
  return out
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Roster export for the debrief coach (off-platform group debriefs). */
export async function rosterCsv(supabase: SupabaseClient<Database>, cohortId: string): Promise<{ filename: string; csv: string }> {
  const { data: cohort } = await supabase.from('cohorts').select('id, name, company_id, debrief_coach_name').eq('id', cohortId).maybeSingle()
  if (!cohort) throw new AdminError(404, 'Cohort not found.')
  const users = await listPortalUsers(supabase, { cohortId })
  const header = ['Name', 'Email', 'Report on file', 'Report date', 'Invited', 'Last seen', 'Chat messages', 'Goals']
  const lines = [header.map(csvCell).join(',')]
  for (const u of users) {
    lines.push(
      [
        u.name,
        u.email,
        u.document?.extraction_status === 'complete' ? 'yes' : u.document ? u.document.extraction_status : 'no',
        u.document?.assessment_date || '',
        u.portal.invitedAt ? u.portal.invitedAt.slice(0, 10) : '',
        u.portal.lastSeenAt ? u.portal.lastSeenAt.slice(0, 10) : '',
        u.engagement.chat_messages,
        u.engagement.goals_created,
      ]
        .map(csvCell)
        .join(',')
    )
  }
  const safe = cohort.name.replace(/[^\w.-]+/g, '_')
  return { filename: `roster-${safe}.csv`, csv: lines.join('\n') + '\n' }
}

const INVITE_BATCH_MAX = 25
const INVITE_GAP_MS = 700 // Resend's default rate is 2 req/s; stay well under it.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Invite (or re-invite) portal users in a cohort, throttled, at most
 * INVITE_BATCH_MAX per call — the UI calls again while `remaining > 0`.
 * `onlyUninvited` (default) skips anyone who already has a login token.
 */
export async function inviteCohortBatch(
  supabase: SupabaseClient<Database>,
  cohortId: string,
  opts: { onlyUninvited?: boolean } = {}
): Promise<{ sent: string[]; failed: Array<{ id: string; name: string; error: string }>; skipped: number; remaining: number }> {
  const users = await listPortalUsers(supabase, { cohortId })
  const onlyUninvited = opts.onlyUninvited !== false
  const candidates = users.filter((u) => u.email && (!onlyUninvited || !u.portal.invitedAt))
  const batch = candidates.slice(0, INVITE_BATCH_MAX)
  const sent: string[] = []
  const failed: Array<{ id: string; name: string; error: string }> = []
  let skipped = users.length - candidates.length
  for (let i = 0; i < batch.length; i++) {
    const u = batch[i]
    if ((await recentLoginTokenCount(u.id)) >= MAX_LINKS_PER_HOUR) {
      skipped++
      continue
    }
    try {
      const { data: c } = await supabase.from('clients').select('id, org_id, name, email').eq('id', u.id).maybeSingle()
      if (!c?.email) throw new Error('no email')
      const raw = await createLoginToken(c.id, c.org_id)
      const link = `${getBaseUrl()}/portal/verify?token=${raw}`
      const r = await sendPortalLoginEmail({ client: { id: c.id, name: c.name, email: c.email }, link, kind: 'invite' })
      if (r.ok) sent.push(u.id)
      else failed.push({ id: u.id, name: u.name, error: r.error || 'send failed' })
    } catch (e) {
      failed.push({ id: u.id, name: u.name, error: e instanceof Error ? e.message : String(e) })
    }
    if (i < batch.length - 1) await sleep(INVITE_GAP_MS)
  }
  return { sent, failed, skipped, remaining: Math.max(0, candidates.length - batch.length) }
}
