/**
 * Emails for the coaching-agreement signing flow.
 *
 * The agreement email is a DELIVERY VEHICLE — it does not embed the agreement
 * text. It carries a single CTA to the magic-link signing page where the
 * agreement lives. The logo is the hosted raster PNG (never SVG — stripped by
 * mail clients).
 */
import { getBaseUrl } from './url'

const NAVY = '#0C1940'
const NAVY_DEEP = '#111226'
const CREAM = '#F2F2F0'
const WARM = '#8B8680'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function logoImg(): string {
  const src = `${getBaseUrl()}/logo-email.png`
  return `<img src="${src}" width="150" alt="theLeadershipWell" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;" />`
}

/** The agreement invitation — CTA to the signing page. */
export function buildAgreementEmailHTML(opts: { clientName: string; signUrl: string }): string {
  const { clientName, signUrl } = opts
  const firstName = clientName.split(' ')[0] || 'there'

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(160deg,${NAVY_DEEP} 0%,${NAVY} 100%);padding:30px 44px 26px;text-align:center;">
      ${logoImg()}
    </div>
    <div style="padding:30px 44px 8px;">
      <p style="margin:0 0 14px;font-size:15px;color:#1f2937;line-height:1.7;">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 22px;font-size:15px;color:#1f2937;line-height:1.7;">I'm looking forward to working together. Please review and sign your coaching agreement at the link below. This takes about 5 minutes.</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td style="border-radius:8px;background:${NAVY};">
        <a href="${esc(signUrl)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:${CREAM};text-decoration:none;">Sign Your Agreement &rarr;</a>
      </td></tr></table>
    </div>
    <div style="padding:18px 44px 30px;">
      <p style="margin:0;font-size:12px;color:${WARM};line-height:1.6;">This link expires in 30 days. If you have questions, reply to this email.</p>
    </div>
    <div style="background:${NAVY_DEEP};padding:14px 44px;text-align:center;font-size:11px;color:${WARM};letter-spacing:1px;">
      theLeadershipWell &nbsp;&middot;&nbsp; Confidential
    </div>
  </div>
</body></html>`
}

/** Coach notification — sent to Jeff when a client signs. */
export function buildSignedNotificationHTML(opts: { clientName: string; signedAt: string; recordingAuthorized: boolean }): string {
  const { clientName, signedAt, recordingAuthorized } = opts
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#F2F2F0;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 30px;">
    <p style="margin:0 0 12px;font-size:16px;font-weight:600;">${esc(clientName)} has signed their coaching agreement.</p>
    <p style="margin:0 0 6px;font-size:14px;color:#403832;">Signed ${esc(signedAt)}.</p>
    <p style="margin:0;font-size:14px;color:#403832;">Recording &amp; AI processing: <strong>${recordingAuthorized ? 'Authorized' : 'NOT authorized'}</strong>${recordingAuthorized ? '' : ' — sessions for this client must not be recorded or AI-processed.'}</p>
  </div>
</body></html>`
}

/** The client's copy of their signed agreement. */
export function buildClientCopyHTML(opts: { clientName: string; agreementHtml: string }): string {
  const { clientName, agreementHtml } = opts
  const src = `${getBaseUrl()}/logo-email.png`
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(160deg,${NAVY_DEEP} 0%,${NAVY} 100%);padding:26px 44px;text-align:center;">
      <img src="${src}" width="150" alt="theLeadershipWell" style="display:block;margin:0 auto;border:0;height:auto;" />
    </div>
    <div style="padding:28px 44px 10px;">
      <p style="margin:0 0 18px;font-size:15px;color:#1f2937;line-height:1.7;">Hi ${esc(clientName.split(' ')[0] || 'there')}, thank you for signing. Your copy is below for your records.</p>
      <div style="border-top:1px solid #e5e0d8;padding-top:18px;">${agreementHtml}</div>
    </div>
    <div style="background:${NAVY_DEEP};padding:14px 44px;text-align:center;font-size:11px;color:${WARM};letter-spacing:1px;">
      theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; ${esc(clientName)}
    </div>
  </div>
</body></html>`
}
