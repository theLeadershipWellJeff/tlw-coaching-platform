import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'

// Aggregate "prior hours" blocks can legitimately be thousands of hours.
const MAX_MINUTES = 1_000_000 // ~16,600 hours
const MAX_ROWS = 2000

/**
 * Bulk-import coaching hours (migration 049) — the write path behind the hours
 * log's "Import hours" panel. Two shapes ride the same endpoint: per-session
 * CSV rows (kind 'session') and a single aggregate block of prior hours
 * (kind 'aggregate', e.g. "Prior coaching hours 2015–2024" as one entry).
 *
 * Body: { source?: 'manual'|'csv', entries: [{ session_date, duration_minutes,
 *         client_label, title?, kind?, paid? }] }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const rawEntries = Array.isArray(body?.entries) ? body.entries : []
    if (rawEntries.length === 0) {
      return NextResponse.json({ error: 'entries is required' }, { status: 400 })
    }
    if (rawEntries.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (max ${MAX_ROWS} per import) — split the file.` },
        { status: 400 }
      )
    }
    const source = body?.source === 'csv' ? 'csv' : 'manual'

    const rows: {
      coach_id: string
      session_date: string
      duration_minutes: number
      client_label: string
      title: string | null
      kind: string
      paid: boolean
      source: string
    }[] = []
    for (let i = 0; i < rawEntries.length; i++) {
      const e = rawEntries[i]
      const date = String(e?.session_date || '').trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json(
          { error: `Row ${i + 1}: session_date must be YYYY-MM-DD (got "${date || 'empty'}").` },
          { status: 400 }
        )
      }
      const minutes = Math.round(Number(e?.duration_minutes))
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
        return NextResponse.json(
          { error: `Row ${i + 1}: duration_minutes must be a positive number.` },
          { status: 400 }
        )
      }
      const label = String(e?.client_label || '').trim()
      if (!label) {
        return NextResponse.json(
          { error: `Row ${i + 1}: client_label is required.` },
          { status: 400 }
        )
      }
      rows.push({
        coach_id: coach.id,
        session_date: date,
        duration_minutes: minutes,
        client_label: label.slice(0, 200),
        title: e?.title ? String(e.title).slice(0, 300) : null,
        kind: e?.kind === 'aggregate' ? 'aggregate' : 'session',
        paid: e?.paid !== false,
        source,
      })
    }

    const { data, error } = await supabase.from('coaching_hours_entries').insert(rows).select('id')
    if (error) {
      // 42P01 = relation does not exist — migration 049 not applied yet.
      const missing = /coaching_hours_entries/.test(error.message) && /not exist|not find/i.test(error.message)
      return NextResponse.json(
        {
          error: missing
            ? 'The imported-hours table is not set up yet — apply migration 049_coaching_hours_entries.sql in Supabase first.'
            : error.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ imported: data?.length ?? rows.length })
  } catch (e) {
    return toErrorResponse(e)
  }
}
