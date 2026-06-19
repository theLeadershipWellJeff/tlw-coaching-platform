import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { readJson, toErrorResponse, ApiError } from '@/lib/api-handler'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { buildSignedNotificationHTML, buildClientCopyHTML } from '@/lib/agreement-email'
import { escapeHtml } from '@/lib/html'

export const runtime = 'nodejs'

// PUBLIC route — the magic-link token is the credential. Submit a signed agreement.
const SignSchema = z.object({
  token: z.string().uuid(),
  recordingAuthorized: z.boolean(),
  typedName: z.string().trim().min(2, 'Please type your full name.'),
})

function signatureBlock(typedName: string, signedAt: string, recordingAuthorized: boolean): string {
  return `<div style="font-family:'Cormorant Garamond',Georgia,serif;color:#403832;margin-top:32px;padding-top:18px;border-top:1px solid #e5e0d8;">
    <p style="margin:0 0 6px;font-size:14px;color:#8B8680;">Recording &amp; AI processing: <strong style="color:#403832;">${recordingAuthorized ? 'Authorized' : 'Not authorized'}</strong></p>
    <p style="margin:0;font-size:16px;">Signed by <strong>${escapeHtml(typedName)}</strong> on ${escapeHtml(signedAt)}</p>
  </div>`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await readJson(req, SignSchema)

    const { data: agreement } = await supabase
      .from('agreements')
      .select('id, coach_id, client_id, client_name, body_html, status, signed_at, signing_token_expires_at')
      .eq('sign_token', body.token)
      .maybeSingle()

    if (!agreement) throw new ApiError(404, 'This link is not valid. Please contact your coach.')
    if (agreement.status === 'active' || agreement.signed_at) {
      throw new ApiError(409, "You've already signed this agreement. Thank you.")
    }
    if (agreement.signing_token_expires_at && new Date(agreement.signing_token_expires_at) < new Date()) {
      throw new ApiError(410, 'This link has expired. Please contact your coach to request a new one.')
    }

    const now = new Date()
    const signedAtLabel = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const signedHtml = (agreement.body_html || '') + signatureBlock(body.typedName, signedAtLabel, body.recordingAuthorized)
    const forwarded = req.headers.get('x-forwarded-for') || ''
    const ip = forwarded.split(',')[0].trim() || req.headers.get('x-real-ip') || null

    // Record the signature + invalidate the token (set expiry to now).
    const { error: updErr } = await supabase
      .from('agreements')
      .update({
        status: 'active',
        signed_at: now.toISOString(),
        recording_authorized: body.recordingAuthorized,
        signer_typed_name: body.typedName,
        signer_ip: ip,
        signed_agreement_html: signedHtml,
        signing_token_expires_at: now.toISOString(),
      })
      .eq('id', agreement.id)
      .eq('status', 'sent') // guard against a double-submit race
    if (updErr) throw new Error(`Supabase (agreements sign): ${updErr.message}`)

    // Promote the decision onto the client record — the source of truth the
    // workspace + scoring Gate 1 read.
    await supabase
      .from('clients')
      .update({
        agreement_on_file: true,
        recording_authorized: body.recordingAuthorized,
        agreement_id: agreement.id,
      })
      .eq('id', agreement.client_id)

    // Notify the coach + send the client their copy (best-effort, via the coach's
    // refresh token so it works with no session).
    if (agreement.coach_id) {
      const { data: coach } = await supabase.from('coaches').select('*').eq('id', agreement.coach_id).maybeSingle()
      if (coach) {
        const clientName = agreement.client_name || 'Your client'
        try {
          await sendCoachHtmlEmail(coach, {
            to: process.env.JEFF_CC_EMAIL || coach.email,
            subject: `${clientName} signed their coaching agreement`,
            html: buildSignedNotificationHTML({ clientName, signedAt: signedAtLabel, recordingAuthorized: body.recordingAuthorized }),
          })
        } catch (e) {
          console.error('[agreements/sign] coach notification failed', e)
        }
        const { data: client } = await supabase.from('clients').select('email, name').eq('id', agreement.client_id).maybeSingle()
        if (client?.email) {
          try {
            await sendCoachHtmlEmail(coach, {
              to: client.email,
              subject: 'Your signed coaching agreement — theLeadershipWell',
              html: buildClientCopyHTML({ clientName: client.name || clientName, agreementHtml: signedHtml }),
            })
          } catch (e) {
            console.error('[agreements/sign] client copy failed', e)
          }
        }
      }
    }

    return NextResponse.json({ success: true, clientName: agreement.client_name })
  } catch (e) {
    return toErrorResponse(e)
  }
}
