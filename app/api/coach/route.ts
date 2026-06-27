import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { isValidTimeZone } from '@/lib/datetime'
import { normalizeAvailability, normalizeReminderSettings } from '@/lib/scheduling'
import { normalizeNudgeSettings } from '@/lib/nudges/settings'
import { normalizeBillingSettings } from '@/lib/billing/settings'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The signed-in coach's profile (the bits the app lets them see/edit).
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    coach: {
      name: coach.name,
      email: coach.email,
      role: coach.role,
      timezone: coach.timezone,
      supervisor_email: coach.supervisor_email,
      library_labels: coach.library_labels || {},
      // Always hand the UI a complete, valid shape (defaults when unset).
      availability: normalizeAvailability(coach.availability),
      reminder_settings: normalizeReminderSettings(coach.reminder_settings),
      nudge_settings: normalizeNudgeSettings(coach.nudge_settings),
      billing_settings: normalizeBillingSettings(coach.billing_settings as any),
    },
  })
}

// Library nodes whose label a coach may customize, and a max label length.
const LIBRARY_LABEL_KEYS = ['templates', 'pdf', 'agreement', 'unfiled'] as const
const MAX_LABEL_LEN = 40

/**
 * Update the coach's editable profile.
 * Body may include: { supervisorEmail?: string | null, timezone?: string }
 * ("" clears the supervisor email; timezone must be a valid IANA zone).
 */
export async function PATCH(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const update: {
    supervisor_email?: string | null
    timezone?: string
    library_labels?: Record<string, string>
    availability?: ReturnType<typeof normalizeAvailability>
    reminder_settings?: ReturnType<typeof normalizeReminderSettings>
    nudge_settings?: ReturnType<typeof normalizeNudgeSettings>
  } = {}

  if ('supervisorEmail' in body) {
    const raw = String(body.supervisorEmail ?? '').trim()
    if (raw === '') {
      update.supervisor_email = null
    } else if (EMAIL_RE.test(raw)) {
      update.supervisor_email = raw.toLowerCase()
    } else {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
  }

  if ('timezone' in body) {
    const tz = String(body.timezone ?? '').trim()
    if (!isValidTimeZone(tz)) {
      return NextResponse.json({ error: 'Pick a valid timezone.' }, { status: 400 })
    }
    update.timezone = tz
  }

  if ('libraryLabels' in body) {
    const raw = body.libraryLabels
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: 'Invalid library labels.' }, { status: 400 })
    }
    // Merge onto the existing map; an empty/whitespace value clears that key
    // (falls back to the built-in default in the UI).
    const merged: Record<string, string> = { ...(coach.library_labels || {}) }
    for (const key of LIBRARY_LABEL_KEYS) {
      if (!(key in raw)) continue
      const val = String(raw[key] ?? '').trim().slice(0, MAX_LABEL_LEN)
      if (val) merged[key] = val
      else delete merged[key]
    }
    update.library_labels = merged
  }

  // Scheduling settings — normalize so only valid, total shapes are stored.
  if ('availability' in body) {
    update.availability = normalizeAvailability(body.availability)
  }
  if ('reminderSettings' in body) {
    update.reminder_settings = normalizeReminderSettings(body.reminderSettings)
  }

  // Billing settings — merge onto defaults so partial updates are safe.
  if ('billingSettings' in body) {
    const current = normalizeBillingSettings((coach as any).billing_settings)
    const patch = body.billingSettings as Partial<typeof current>
    update.nudge_settings = update.nudge_settings // keep TS happy
    ;(update as any).billing_settings = normalizeBillingSettings({ ...current, ...patch })
  }

  // Vault settings (the editable part of nudge_settings) — merge onto the current
  // shape so we never drop the spacing/re-engagement fields.
  if ('vaultFolderPath' in body) {
    const next = normalizeNudgeSettings(coach.nudge_settings)
    next.vault_folder_path = String(body.vaultFolderPath ?? '')
    update.nudge_settings = normalizeNudgeSettings(next)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await supabase.from('coaches').update(update).eq('id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(update)
}
