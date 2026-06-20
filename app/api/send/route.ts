import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { buildClientEmailHTML } from '@/lib/email-template'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { coachCanAccessClient } from '@/lib/client-access'
import { persistActionLinks } from '@/lib/actions'
import { findClientByEmailOrName } from '@/lib/client-lookup'
import { getBaseUrl } from '@/lib/url'
import { headerSafe, encodeHeaderValue } from '@/lib/email-mime'

function makeRawEmail(to: string, cc: string, subject: string, body: string, isHTML: boolean) {
  const contentType = isHTML ? 'text/html' : 'text/plain'
  const from = process.env.JEFF_FROM_EMAIL!

  const message = [
    `From: Jeff Holmes <${from}>`,
    `To: ${headerSafe(to)}`,
    `Cc: ${headerSafe(cc)}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    ``,
    body,
  ].join('\r\n')

  return Buffer.from(message).toString('base64url')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { clientEmail, clientName, content, sendIntro, introText } = await req.json()

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: session.accessToken as string })
  const gmail = google.gmail({ version: 'v1', auth })
  const cc = process.env.JEFF_CC_EMAIL!

  const results = []

  // 1. Send intro email
  if (sendIntro && introText) {
    const introRaw = makeRawEmail(
      clientEmail,
      cc,
      'Quick favor - feedback on something I\'m building',
      introText,
      false
    )
    const introResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: introRaw },
    })
    results.push({ type: 'intro', id: introResult.data.id })
  }

  // 2. Send prep sheet. When we can tie the email to a client (match on email
  // first, then name), make the action items click-to-log checkboxes and add an
  // "Help shape our agenda" link. No match → plain boxes/no agenda, still sends.
  let actionLinks: (string | null)[] = []
  let agendaUrl: string | undefined
  // Captured during matching so we can snapshot the sent prep sheet afterward.
  let matchedClientId: string | null = null
  let matchedCoachId: string | null = null
  try {
    const supabase = getSupabaseAdmin()
    const coach = await getSessionCoach(supabase)
    const row = await findClientByEmailOrName(supabase, { email: clientEmail, name: clientName })
    // Tenant boundary: only tie tracking (action links, agenda, prep snapshot) to
    // a matched client this coach is actually linked to. A foreign match is
    // treated as no-match — the prep email still sends with plain boxes.
    const ownsMatch = !!row?.id && !!coach && (await coachCanAccessClient(supabase, coach.id, row.id))
    if (row?.id && ownsMatch) {
      matchedClientId = row.id
      const actions: string[] = Array.isArray(content?.actions) ? content.actions : []
      if (actions.length > 0) {
        const links = await persistActionLinks(supabase, row.id, null, actions)
        const urlByDesc = new Map(links.map((l) => [l.description, l.url]))
        actionLinks = actions.map((a) => urlByDesc.get(String(a || '').trim()) || null)
      }
      matchedCoachId = coach?.id ?? null
      const { data: agenda } = await supabase
        .from('agenda_requests')
        .insert({ coach_id: coach?.id ?? null, client_id: row.id, token: randomUUID(), status: 'pending' })
        .select('token')
        .single()
      if (agenda?.token) agendaUrl = `${getBaseUrl()}/agenda/${agenda.token}`
    }
  } catch (e) {
    // Tracking is additive — never block the prep email on it — but log it so a
    // broken action-link / agenda flow doesn't fail silently.
    console.error('[send] prep tracking (action links / agenda) failed', e)
  }

  const html = buildClientEmailHTML(clientName, content, actionLinks, agendaUrl)

  // Snapshot the prep sheet against the client so it can be re-read in the
  // workspace alongside the session notes. Best-effort — never block the send.
  if (matchedClientId) {
    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('prep_sheets').insert({
        coach_id: matchedCoachId,
        client_id: matchedClientId,
        content,
        html,
        sent_at: new Date().toISOString(),
      })
    } catch (e) {
      // Persisting the prep sheet is additive — log, don't block the send.
      console.error('[send] prep sheet snapshot failed', { clientId: matchedClientId, error: e })
    }
  }

  const prepRaw = makeRawEmail(
    clientEmail,
    cc,
    'Your Session Preparation - theLeadershipWell',
    html,
    true
  )
  const prepResult = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: prepRaw },
  })
  results.push({ type: 'prep', id: prepResult.data.id })

  return NextResponse.json({ success: true, results })
}
