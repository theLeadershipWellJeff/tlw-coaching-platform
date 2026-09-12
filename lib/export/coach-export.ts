/**
 * "Download my data" — everything a coach put into the platform, as one ZIP
 * they can read without us: CSVs for the tables, one folder per client with
 * their session notes (HTML), transcripts (Markdown), and scorecards (JSON).
 *
 * Scope = the coach's own tenant: clients through `coach_clients`, and every
 * coach_id-keyed table. Coach-private fields (key_info) ARE included — it is
 * the coach's own data. Nothing from another coach, nothing from the
 * platform's own tables (prompt briefs, garden index, audit log).
 *
 * Available to a LOCKED coach on purpose (the wall's "Download my data"):
 * lapsing means losing access to the app, never to the work.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database } from '@/lib/supabase/types'
import { accessibleClientIds } from '@/lib/client-access'
import { buildZip, type ZipEntry } from '@/lib/zip'

type Admin = SupabaseClient<Database>
type Row = Record<string, any>

const BATCH = 100

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Row[], columns: string[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','))
  return lines.join('\r\n') + '\r\n'
}

// Strip path separators, reserved punctuation, and control characters so a
// client name can never escape its folder or break an unzip tool.
const UNSAFE = /[\\/:*?"<>|]|[^\x20-\x7e -￿]/g

function safeName(s: string | null | undefined, fallback: string): string {
  const cleaned = (s || '').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || fallback).slice(0, 80)
}

function dateStamp(iso: string | null | undefined): string {
  if (!iso) return 'undated'
  return String(iso).slice(0, 10)
}

async function selectIn(supabase: Admin, table: string, column: string, ids: string[], select = '*'): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH)
    const { data, error } = await supabase.from(table as any).select(select).in(column, slice)
    if (error) {
      // A table that isn't there (an unapplied migration) must not sink the
      // whole export — note it and move on.
      out.push({ __error: `${table}: ${error.message}` })
      break
    }
    out.push(...((data ?? []) as Row[]))
  }
  return out
}

async function selectBy(supabase: Admin, table: string, column: string, value: string, select = '*'): Promise<Row[]> {
  const { data, error } = await supabase.from(table as any).select(select).eq(column, value)
  if (error) return [{ __error: `${table}: ${error.message}` }]
  return (data ?? []) as Row[]
}

function splitErrors(rows: Row[]): { rows: Row[]; errors: string[] } {
  const errors = rows.filter((r) => r.__error).map((r) => r.__error as string)
  return { rows: rows.filter((r) => !r.__error), errors }
}

export async function buildCoachExport(
  supabase: Admin,
  coach: Coach
): Promise<{ zip: Buffer; filename: string; counts: Record<string, number> }> {
  const clientIds = await accessibleClientIds(supabase, coach.id)
  const errors: string[] = []
  const entries: ZipEntry[] = []
  const counts: Record<string, number> = {}

  const take = (name: string, rows: Row[]) => {
    const s = splitErrors(rows)
    errors.push(...s.errors)
    counts[name] = s.rows.length
    return s.rows
  }

  const clients = take('clients', await selectIn(supabase, 'clients', 'id', clientIds))
  const notes = take('notes', await selectIn(supabase, 'notes', 'client_id', clientIds))
  const actions = take('actions', await selectIn(supabase, 'actions', 'client_id', clientIds))
  const transcripts = take('transcripts', await selectBy(supabase, 'transcripts', 'coach_id', coach.id))
  const reports = take('session_reports', await selectBy(supabase, 'session_reports', 'coach_id', coach.id))
  const appointments = take('appointments', await selectBy(supabase, 'appointments', 'coach_id', coach.id))
  const communications = take('communications', await selectBy(supabase, 'communications', 'coach_id', coach.id))
  const nudges = take('nudges', await selectBy(supabase, 'nudges', 'coach_id', coach.id))
  const plans = take('session_plans', await selectBy(supabase, 'session_plans', 'coach_id', coach.id))
  const templates = take('note_templates', await selectBy(supabase, 'note_templates', 'coach_id', coach.id))
  const hours = take('coaching_hours_entries', await selectBy(supabase, 'coaching_hours_entries', 'coach_id', coach.id))
  const agreements = take('agreements', await selectIn(supabase, 'agreements', 'client_id', clientIds))
  const billingAccounts = take('billing_accounts', await selectBy(supabase, 'billing_accounts', 'coach_id', coach.id))
  const invoices = take('invoices', await selectBy(supabase, 'invoices', 'coach_id', coach.id))

  const clientById = new Map<string, Row>(clients.map((c) => [c.id, c]))
  const folderFor = (clientId: string | null | undefined): string => {
    const c = clientId ? clientById.get(clientId) : null
    return `clients/${safeName(c?.name, c ? 'client' : 'unassigned')}`
  }
  const withClientName = (rows: Row[]) => rows.map((r) => ({ ...r, client_name: clientById.get(r.client_id)?.name ?? '' }))

  // ── Tables ──────────────────────────────────────────────────────────────
  entries.push({
    name: 'clients.csv',
    data: toCsv(clients, [
      'id', 'name', 'email', 'phone', 'company', 'title', 'status', 'client_type', 'timezone', 'address',
      'session_fee', 'coaching_map', 'coaching_goals', 'key_info', 'tags', 'bio', 'agreement_on_file',
      'recording_authorized', 'created_at',
    ]),
  })
  entries.push({
    name: 'actions.csv',
    data: toCsv(withClientName(actions), ['id', 'client_name', 'client_id', 'note_id', 'description', 'due_date', 'status', 'completed_at', 'completed_via', 'created_at']),
  })
  entries.push({
    name: 'appointments.csv',
    data: toCsv(withClientName(appointments), ['id', 'client_name', 'client_id', 'scheduled_at', 'duration_minutes', 'status', 'source', 'title', 'attendee_email', 'google_event_id', 'created_at']),
  })
  entries.push({
    name: 'communications.csv',
    data: toCsv(withClientName(communications), ['id', 'client_name', 'client_id', 'type', 'direction', 'subject', 'preview', 'status', 'error_detail', 'sent_at']),
  })
  entries.push({
    name: 'nudges.csv',
    data: toCsv(withClientName(nudges), ['id', 'client_name', 'client_id', 'type', 'origin', 'status', 'draft_subject', 'draft_body', 'coach_note', 'trigger_excerpt', 'rationale', 'scheduled_for', 'sent_at', 'created_at']),
  })
  entries.push({
    name: 'coaching_hours_entries.csv',
    data: toCsv(hours, ['id', 'session_date', 'duration_minutes', 'client_label', 'title', 'kind', 'paid', 'source', 'created_at']),
  })
  entries.push({ name: 'billing/accounts.csv', data: toCsv(billingAccounts, Object.keys(billingAccounts[0] ?? { id: 1 })) })
  entries.push({ name: 'billing/invoices.csv', data: toCsv(invoices, Object.keys(invoices[0] ?? { id: 1 })) })
  entries.push({
    name: 'agreements.csv',
    data: toCsv(withClientName(agreements), ['id', 'client_name', 'client_id', 'status', 'signed_at', 'recording_authorized', 'signer_typed_name', 'created_at']),
  })
  for (const a of agreements) {
    const html = a.signed_agreement_html || a.body_html
    if (html) {
      entries.push({ name: `${folderFor(a.client_id)}/agreements/${dateStamp(a.signed_at || a.created_at)} agreement.html`, data: html })
    }
  }

  // ── Per-client documents ────────────────────────────────────────────────
  for (const n of notes) {
    const title = safeName(n.title, 'note')
    const stamp = dateStamp(n.session_date || n.created_at)
    const body = `<!doctype html><meta charset="utf-8"><title>${title}</title>\n<h1>${title}</h1>\n<p>Session date: ${n.session_date ?? ''} · Duration: ${n.duration_minutes ?? ''} min</p>\n${n.content ?? ''}`
    entries.push({ name: `${folderFor(n.client_id)}/notes/${stamp} ${title}.html`, data: body, mtime: new Date(n.updated_at || n.created_at || Date.now()) })
    if (n.generated_narrative) {
      entries.push({ name: `${folderFor(n.client_id)}/notes/${stamp} ${title} - sent to client.txt`, data: n.generated_narrative })
    }
  }
  for (const t of transcripts) {
    const title = safeName(t.title || t.filename, 'transcript')
    entries.push({
      name: `${folderFor(t.client_id)}/transcripts/${dateStamp(t.session_date || t.created_at)} ${title}.md`,
      data: t.raw_md ?? '',
      mtime: new Date(t.created_at || Date.now()),
    })
  }
  for (const r of reports) {
    entries.push({
      name: `${folderFor(r.client_id)}/scorecards/${dateStamp(r.session_date || r.created_at)} scorecard.json`,
      data: JSON.stringify(
        {
          overall_score: r.overall_score, band: r.band, session_number: r.session_number, session_type: r.session_type,
          coach_self_scores: r.coach_self_scores, coach_overall: r.coach_overall, coach_notes: r.coach_notes, report: r.report,
        },
        null,
        2
      ),
    })
  }
  for (const p of plans) {
    entries.push({
      name: `${folderFor(p.client_id)}/session-plans/${dateStamp(p.created_at)} ${safeName(p.title, 'plan')}.json`,
      data: JSON.stringify({ title: p.title, notes: p.notes, plan: p.plan }, null, 2),
    })
  }
  for (const c of clients) {
    entries.push({ name: `${folderFor(c.id)}/client.json`, data: JSON.stringify(c, null, 2) })
  }
  for (const t of templates) {
    entries.push({ name: `templates/${safeName(t.name, 'template')}.html`, data: `<!doctype html><meta charset="utf-8">\n${t.content ?? ''}` })
  }

  // ── Readme ──────────────────────────────────────────────────────────────
  const readme = [
    `theLeadershipWell - data export for ${coach.name || coach.email}`,
    `Generated ${new Date().toISOString()}`,
    '',
    'What is here:',
    '  clients.csv                      your roster (goals, key info, fees)',
    '  clients/<name>/client.json       the full client record',
    '  clients/<name>/notes/            session notes (HTML) + the text sent to the client',
    '  clients/<name>/transcripts/      session transcripts (Markdown)',
    '  clients/<name>/scorecards/       machine + self scores per session (JSON)',
    '  clients/<name>/session-plans/    saved session plans',
    '  clients/<name>/agreements/       signed coaching agreements (HTML)',
    '  actions.csv, appointments.csv, communications.csv, nudges.csv,',
    '  coaching_hours_entries.csv, agreements.csv, billing/, templates/',
    '',
    'Counts: ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', '),
    ...(errors.length ? ['', 'Some tables could not be read:', ...errors.map((e) => '  ' + e)] : []),
    '',
  ].join('\n')
  entries.unshift({ name: 'README.txt', data: readme })

  const stamp = new Date().toISOString().slice(0, 10)
  return { zip: buildZip(entries), filename: `theleadershipwell-export-${stamp}.zip`, counts }
}
