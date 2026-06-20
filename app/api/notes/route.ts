import { NextRequest, NextResponse } from 'next/server'
import { requireSession, toErrorResponse } from '@/lib/api-handler'

// Reads the session (headers), so never statically prerendered.
export const dynamic = 'force-dynamic'

const CA_URL = 'https://www.coachaccountable.com/API/'
const CA_ID = process.env.COACH_ACCOUNTABLE_API_ID!
const CA_KEY = process.env.COACH_ACCOUNTABLE_API_KEY!

async function caPost(action: string, params: Record<string, string> = {}) {
  const body = new URLSearchParams({ a: action, APIID: CA_ID, APIKey: CA_KEY, ...params })
  const res = await fetch(CA_URL, { method: 'POST', body })
  const json = await res.json()
  if (json.error !== 0) throw new Error(json.message)
  return json.return
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  // This proxies a client's Coach Accountable notes/actions using the server's
  // CA credentials, so it must never be reachable unauthenticated. CA is keyed
  // by name (not the local roster), so we gate on a signed-in session here; the
  // per-client tenant boundary lives on the roster routes that read the `clients`
  // table.
  try {
    await requireSession()
  } catch (e) {
    return toErrorResponse(e)
  }

  const { searchParams } = new URL(req.url)
  const clientName = searchParams.get('clientName')
  const clientId = searchParams.get('clientId')

  if (!clientName && !clientId) {
    return NextResponse.json({ error: 'clientName or clientId required' }, { status: 400 })
  }

  let resolvedClientId = clientId

  if (!resolvedClientId && clientName) {
    const clients = await caPost('Client.getAll')
    const match = clients.find((c: any) => {
      const full = `${c.firstName} ${c.lastName}`.toLowerCase()
      return full.includes(clientName.toLowerCase()) ||
             clientName.toLowerCase().includes(c.firstName.toLowerCase())
    })
    if (!match) {
      return NextResponse.json({ error: `No client found matching: ${clientName}` }, { status: 404 })
    }
    resolvedClientId = match.ID
  }

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateFrom = sixMonthsAgo.toISOString().split('T')[0]

  let notes: any[] = []
  let actions: any[] = []

  try {
    const rawNotes = await caPost('Session.getAll', {
      ClientID: resolvedClientId!,
      dateFrom,
    })
    notes = (rawNotes || []).map((n: any) => ({
      id: n.ID,
      date: n.dateOf,
      title: n.title,
      content: stripHTML(n.content || ''),
    }))
  } catch (e) {
    console.error('Notes fetch error:', e)
  }

  try {
    const rawActions = await caPost('Action.getAll', {
      ClientID: resolvedClientId!,
      status: 'incomplete',
    })
    actions = (rawActions || []).map((a: any) => ({
      id: a.ID,
      description: a.theAction,
      dueDate: a.dateDue,
      status: a.status,
    }))
  } catch (e) {
    console.error('Actions fetch error:', e)
  }

  return NextResponse.json({ clientId: resolvedClientId, notes, actions })
}
