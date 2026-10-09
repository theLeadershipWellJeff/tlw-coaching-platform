/**
 * THE outbound gate for Google + Resend (testing system, docs/TESTING_SYSTEM.md §3).
 *
 * Every Gmail and Google Calendar client in the app is built here, never with
 * `google.gmail(...)` / `google.calendar(...)` directly — `scripts/check-env-guard.sh`
 * fails the build otherwise. In production these return the real googleapis
 * clients, unchanged. On staging (lib/env.ts#isStaging):
 *   - Gmail: `users.messages.send` writes the decoded message to `test_email_sink`
 *     and returns a fake id. Nothing is sent. A sink write failure is returned as
 *     a send failure — it NEVER falls through to a real send.
 *   - Calendar: every call resolves to an empty result (no events, no busy
 *     times, a fake id on insert). Nothing is created, moved or deleted.
 * Resend (lib/email/transactional.ts) and the unattended coach sender
 * (lib/gmail.ts) call `sinkEmail` directly.
 */
import { google, type calendar_v3, type gmail_v1 } from 'googleapis'
import { isStaging } from './env'
import { getSupabaseAdmin } from './supabase/server'

type Auth = InstanceType<typeof google.auth.OAuth2>

export type SinkMessage = {
  transport: string
  from?: string | null
  to: string
  cc?: string | null
  replyTo?: string | null
  subject?: string | null
  html?: string | null
  text?: string | null
  attachments?: { filename: string; contentType: string; bytes: number }[]
  meta?: Record<string, unknown>
}

/** Write one would-be email to the staging sink. Returns a fake message id. */
export async function sinkEmail(msg: SinkMessage): Promise<string> {
  // test_email_sink exists on staging only (supabase/staging/003), so it is
  // deliberately absent from the hand-written production types.
  const db = getSupabaseAdmin() as unknown as { from: (t: string) => any }
  const { data, error } = await db
    .from('test_email_sink')
    .insert({
      transport: msg.transport,
      from_addr: msg.from ?? null,
      to_addr: msg.to,
      cc_addr: msg.cc ?? null,
      reply_to: msg.replyTo ?? null,
      subject: msg.subject ?? null,
      html: msg.html ?? null,
      text_body: msg.text ?? null,
      attachments: msg.attachments ?? null,
      meta: msg.meta ?? null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`staging email sink write failed: ${error?.message || 'no row'}`)
  return `staging-sink-${data.id}`
}

/** Decode an RFC 2822 base64url `raw` (what Gmail's send takes) into sink fields. */
export function decodeRawEmail(raw: string): Omit<SinkMessage, 'transport'> {
  const text = Buffer.from(raw, 'base64url').toString('utf8')
  const split = text.search(/\r?\n\r?\n/)
  const head = split >= 0 ? text.slice(0, split) : text
  const body = split >= 0 ? text.slice(split).replace(/^\r?\n\r?\n/, '') : ''
  const headers: Record<string, string> = {}
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return {
    from: headers['from'] ?? null,
    to: headers['to'] || '(none)',
    cc: headers['cc'] ?? null,
    replyTo: headers['reply-to'] ?? null,
    subject: decodeMimeWords(headers['subject'] || ''),
    html: body.slice(0, 500_000),
  }
}

function decodeMimeWords(s: string): string {
  return s.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_m, enc: string, val: string) =>
    enc.toLowerCase() === 'b'
      ? Buffer.from(val, 'base64').toString('utf8')
      : val.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16)))
  )
}

/** A Gmail client. `site` names the caller in the sink row (staging only). */
export function gmailClient(auth: Auth, site: string): gmail_v1.Gmail {
  if (!isStaging()) return google.gmail({ version: 'v1', auth })
  const send = async (params: { requestBody?: { raw?: string | null } }) => {
    const raw = params?.requestBody?.raw || ''
    const id = await sinkEmail({ transport: `gmail-direct:${site}`, ...decodeRawEmail(raw) })
    return { data: { id, threadId: null, labelIds: ['SENT'] }, status: 200 }
  }
  return { users: { messages: { send } } } as unknown as gmail_v1.Gmail
}

/** A Calendar client. On staging every call is an inert empty result. */
export function calendarClient(auth: Auth): calendar_v3.Calendar {
  if (!isStaging()) return google.calendar({ version: 'v3', auth })
  const result = {
    status: 200,
    data: { id: 'staging-stub-event', items: [], calendars: {}, nextSyncToken: 'staging-stub-sync', status: 'confirmed' },
  }
  const inert: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? undefined : inert),
    apply: () => Promise.resolve(result),
  })
  return inert as calendar_v3.Calendar
}
