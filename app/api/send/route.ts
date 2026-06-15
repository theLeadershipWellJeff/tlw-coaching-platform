import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '@/lib/authOptions'
import { buildClientEmailHTML } from '@/lib/email-template'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { persistActionLinks } from '@/lib/actions'

function makeRawEmail(to: string, cc: string, subject: string, body: string, isHTML: boolean) {
  const contentType = isHTML ? 'text/html' : 'text/plain'
  const from = process.env.JEFF_FROM_EMAIL!

  const message = [
    `From: Jeff Holmes <${from}>`,
    `To: ${to}`,
    `Cc: ${cc}`,
    `Subject: ${subject}`,
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
      'Quick favor — feedback on something I\'m building',
      introText,
      false
    )
    const introResult = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: introRaw },
    })
    results.push({ type: 'intro', id: introResult.data.id })
  }

  // 2. Send prep sheet. Make each action item a click-to-log checkbox (same
  // system as the note "send to client" flow) when we can tie it to a client —
  // match on email first, then name. No match → plain boxes, email still sends.
  let actionLinks: (string | null)[] = []
  try {
    const actions: string[] = Array.isArray(content?.actions) ? content.actions : []
    if (actions.length > 0) {
      const supabase = getSupabaseAdmin()
      let row: { id: string } | null = null
      if (clientEmail) {
        const { data } = await supabase.from('clients').select('id').ilike('email', clientEmail).limit(1).maybeSingle()
        row = data
      }
      if (!row && clientName) {
        const { data } = await supabase.from('clients').select('id').ilike('name', clientName).limit(1).maybeSingle()
        row = data
      }
      if (row?.id) {
        const links = await persistActionLinks(supabase, row.id, null, actions)
        const urlByDesc = new Map(links.map((l) => [l.description, l.url]))
        actionLinks = actions.map((a) => urlByDesc.get(String(a || '').trim()) || null)
      }
    }
  } catch {
    // Tracking is additive — never block the prep email on it.
    actionLinks = []
  }

  const html = buildClientEmailHTML(clientName, content, actionLinks)
  const prepRaw = makeRawEmail(
    clientEmail,
    cc,
    'Your Session Preparation — theLeadershipWell',
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
