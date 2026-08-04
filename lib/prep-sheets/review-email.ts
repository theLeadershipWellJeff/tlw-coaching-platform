/**
 * The coach's daily prep-sheet review digest — internal operational mail (from
 * Jeff, to Jeff), so: no client-facing Cormorant Garamond, DM Sans throughout,
 * and NO server-side signature (see generate.ts). One email per coach per day
 * covering every appointment processed in that tick.
 *
 * Brand: deep navy #111226 / rich navy #0C1940 / cream #F2F2F0 / warm gray
 * #8B8680. Signal Orange #E8650A is used at most once, only to flag a failure /
 * short-notice item, and never on a button. Logo is the raster PNG (SVG is
 * stripped by mail clients). All links are absolute (getBaseUrl upstream).
 */
import { escapeHtml } from '@/lib/html'

const NAVY_DEEP = '#111226'
const NAVY_RICH = '#0C1940'
const CREAM = '#F2F2F0'
const WARM_GRAY = '#8B8680'
const SIGNAL_ORANGE = '#E8650A'
const LOGO_URL = 'https://theleadershipwell.online/logo-email.png'
const FONT = "'DM Sans',Helvetica,Arial,sans-serif"

export type PrepReviewDraft = {
  clientName: string
  whenLabel: string // session time in coach tz
  deliveryLabel: string // exact client-delivery moment, plain language
  reviewUrl: string
  skipUrl: string
  shortNotice?: boolean // delivery clamped inside the preferred window — flag it
}

export type PrepReviewIneligible = {
  clientName: string
  whenLabel: string
  buildUrl: string
  reason: 'no_history' | 'failed'
}

export function prepReviewSubject(draftCount: number, ineligibleCount: number): string {
  if (draftCount === 0 && ineligibleCount > 0) {
    return `${ineligibleCount} session${ineligibleCount === 1 ? '' : 's'} need a prep sheet built by hand`
  }
  const base =
    draftCount === 1 ? '1 prep sheet ready to review' : `${draftCount} prep sheets ready to review`
  return ineligibleCount > 0 ? `${base} (+${ineligibleCount} to build by hand)` : base
}

function draftRow(d: PrepReviewDraft): string {
  const flag = d.shortNotice
    ? `<span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:${SIGNAL_ORANGE};">SHORT NOTICE</span>`
    : ''
  return `
  <tr><td style="padding:16px 0;border-bottom:1px solid rgba(139,134,128,.25);">
    <div style="font-size:15px;font-weight:700;color:${NAVY_DEEP};">${escapeHtml(d.clientName)}${flag}</div>
    <div style="font-size:13px;color:${WARM_GRAY};margin-top:3px;">Session · ${escapeHtml(d.whenLabel)}</div>
    <div style="font-size:13px;color:${NAVY_RICH};margin-top:2px;">Delivers to the client · <strong>${escapeHtml(d.deliveryLabel)}</strong></div>
    <div style="margin-top:12px;">
      <a href="${d.reviewUrl}" style="display:inline-block;background:${NAVY_RICH};color:${CREAM};text-decoration:none;font-size:13px;font-weight:600;padding:9px 18px;border-radius:6px;">Review &amp; approve &rarr;</a>
      <a href="${d.skipUrl}" style="display:inline-block;margin-left:14px;font-size:13px;color:${WARM_GRAY};text-decoration:underline;">Skip this one</a>
    </div>
  </td></tr>`
}

function ineligibleRow(x: PrepReviewIneligible): string {
  const note =
    x.reason === 'failed'
      ? `<span style="color:${SIGNAL_ORANGE};font-weight:600;">couldn’t auto-draft — build by hand</span>`
      : 'no recent history on file'
  return `
  <tr><td style="padding:11px 0;border-bottom:1px solid rgba(139,134,128,.18);">
    <span style="font-size:13px;font-weight:600;color:${NAVY_DEEP};">${escapeHtml(x.clientName)}</span>
    <span style="font-size:12px;color:${WARM_GRAY};"> · ${escapeHtml(x.whenLabel)} · ${note}</span>
    <a href="${x.buildUrl}" style="font-size:12px;color:${NAVY_RICH};text-decoration:underline;margin-left:8px;">Build manually</a>
  </td></tr>`
}

export function buildPrepReviewEmailHTML(opts: {
  coachName: string
  drafts: PrepReviewDraft[]
  ineligible: PrepReviewIneligible[]
}): string {
  const { coachName, drafts, ineligible } = opts
  // A failed row is allowed to carry the single Signal-Orange accent; if any
  // draft is short-notice we've already spent it there, so prefer that placement.
  const draftsBlock = drafts.length
    ? `
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${WARM_GRAY};font-weight:700;margin:0 0 4px;">Ready to review</p>
    <table cellpadding="0" cellspacing="0" width="100%" role="presentation">${drafts.map(draftRow).join('')}</table>`
    : `<p style="font-size:14px;color:${WARM_GRAY};">No sheets were auto-drafted this round.</p>`

  const ineligibleBlock = ineligible.length
    ? `
    <div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(139,134,128,.3);">
      <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${WARM_GRAY};font-weight:700;margin:0 0 4px;">Not auto-drafted</p>
      <p style="font-size:12px;color:${WARM_GRAY};margin:0 0 6px;">These sessions were skipped — build one by hand if you'd like to send one.</p>
      <table cellpadding="0" cellspacing="0" width="100%" role="presentation">${ineligible.map(ineligibleRow).join('')}</table>
    </div>`
    : ''

  const first = coachName?.split(/\s+/)[0] || 'there'

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;background:${CREAM};font-family:${FONT};color:${NAVY_DEEP};">
  <div style="max-width:600px;margin:0 auto;padding:28px 20px;">
    <div style="background:linear-gradient(160deg,${NAVY_DEEP} 0%,${NAVY_RICH} 100%);border-radius:12px 12px 0 0;padding:26px 28px;text-align:center;">
      <img src="${LOGO_URL}" width="180" alt="theLeadershipWell" style="display:block;margin:0 auto 10px;border:0;height:auto;" />
      <p style="color:${WARM_GRAY};font-size:9px;letter-spacing:4px;text-transform:uppercase;margin:0;">Prep Sheet Review</p>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:26px 28px;">
      <p style="font-size:14px;color:${NAVY_DEEP};margin:0 0 18px;line-height:1.6;">Morning, ${escapeHtml(first)} — the drafts below are ready. Each will reach the client at the delivery time shown unless you edit, skip, or approve it first. Skipping is one click; approving happens in the app so you can read the sheet.</p>
      ${draftsBlock}
      ${ineligibleBlock}
    </div>
    <p style="text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${WARM_GRAY};margin:18px 0 0;">theLeadershipWell · internal</p>
  </div>
</body></html>`
}
