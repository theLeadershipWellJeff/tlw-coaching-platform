import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, readJson, toErrorResponse } from '@/lib/api-handler'
import {
  getActiveSignatureHtml,
  parseSignatureFields,
  serializeSignature,
  buildSignatureHtmlFromFields,
  type SignatureFields,
} from '@/lib/signature'

export const runtime = 'nodejs'

/**
 * The active branded signature for the signed-in coach — so the Compose panel
 * can render the exact block that will be appended at send time, and the
 * Account → Email signature editor can load what's saved. The signature is
 * still appended server-side on send; GET is preview/load only.
 *
 * Returns { html, custom, fields }: `custom` = the coach has saved their own
 * row; `fields` = the structured editor fields when recoverable (null for a
 * legacy hand-written row).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    // Newest-first + limit(1): duplicate rows (pre-048 race) must not error.
    const { data: ownRows } = await supabase
      .from('email_signatures')
      .select('html')
      .eq('coach_id', coach.id)
      .order('updated_at', { ascending: false })
      .limit(1)
    const own = ownRows?.[0]
    const html = own?.html ?? (await getActiveSignatureHtml(supabase, coach))
    return NextResponse.json({
      html: stripFieldsComment(html),
      custom: !!own,
      fields: own?.html ? parseSignatureFields(own.html) : null,
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FieldsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  title: z.string().trim().min(1, 'Title is required').max(160),
  email: z.string().trim().regex(EMAIL_RE, 'A valid email is required').max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  website: z.string().trim().max(200).optional().or(z.literal('')),
  bookingUrl: z
    .string()
    .trim()
    .max(400)
    .refine((v) => !v || /^https?:\/\//.test(v), 'The booking link must start with http(s)://')
    .optional()
    .or(z.literal('')),
})

/** Save (upsert) the signed-in coach's signature from structured fields. */
export async function PUT(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const raw = await readJson(req, FieldsSchema)
    const fields: SignatureFields = {
      name: raw.name,
      title: raw.title,
      email: raw.email.toLowerCase(),
      phone: raw.phone || undefined,
      website: raw.website || undefined,
      bookingUrl: raw.bookingUrl || undefined,
    }
    const html = serializeSignature(fields)

    // Hand-rolled upsert (migration 048 adds the unique index; this also heals
    // any duplicate rows a pre-048 save race left behind): update the newest
    // row, delete the rest, insert when none exists.
    const { data: existing } = await supabase
      .from('email_signatures')
      .select('id')
      .eq('coach_id', coach.id)
      .order('updated_at', { ascending: false })
    if (existing && existing.length > 0) {
      const [keep, ...stale] = existing
      const { error } = await supabase
        .from('email_signatures')
        .update({ html, updated_at: new Date().toISOString() })
        .eq('id', keep.id)
      if (error) throw new Error(`Supabase (signature update): ${error.message}`)
      if (stale.length > 0) {
        await supabase
          .from('email_signatures')
          .delete()
          .in('id', stale.map((r) => r.id))
      }
    } else {
      const { error } = await supabase
        .from('email_signatures')
        .insert({ coach_id: coach.id, html })
      if (error) throw new Error(`Supabase (signature insert): ${error.message}`)
    }

    return NextResponse.json({ html: buildSignatureHtmlFromFields(fields), custom: true, fields })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/** Remove the coach's saved signature — future sends fall back to the generic one. */
export async function DELETE() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const { error } = await supabase.from('email_signatures').delete().eq('coach_id', coach.id)
    if (error) throw new Error(`Supabase (signature delete): ${error.message}`)
    const html = await getActiveSignatureHtml(supabase, coach)
    return NextResponse.json({ html: stripFieldsComment(html), custom: false, fields: null })
  } catch (e) {
    return toErrorResponse(e)
  }
}

/** The preview html shown in the UI — without the internal fields comment. */
function stripFieldsComment(html: string): string {
  return (html || '').replace(/^<!--TLW_SIG_FIELDS:.*?-->/, '')
}
