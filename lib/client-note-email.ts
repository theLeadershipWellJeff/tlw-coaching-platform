/**
 * HTML email for the "send to client" note recap. Renders the cleaned-up
 * narrative, an Insights list (✦), and an Action items checklist where each box
 * is a click-to-log link (email can't run live checkboxes) that records the
 * action as done when the client taps it.
 *
 * Icons are consistent with the in-app capture panel: ✦ for insights, a square
 * checkbox for actions.
 */

const NAVY = '#0C1940'
const NAVY_DEEP = '#111226'
const CREAM = '#F2F2F0'
const WARM = '#8B8680'
const ORANGE = '#E8650A'

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraphs(text: string): string {
  return (text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;font-size:14px;color:#1f2937;line-height:1.7;">${esc(line)}</p>`)
    .join('')
}

export type NoteEmailAction = { description: string; url: string }

export function buildNoteEmailHTML(opts: {
  clientName: string
  bodyText: string
  insights: string[]
  actions: NoteEmailAction[]
}): string {
  const { clientName, bodyText, insights, actions } = opts

  const logo = `<svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="62,10 10,10 10,90 90,90 90,46" stroke="${CREAM}" stroke-width="7" fill="none" stroke-linecap="square" stroke-opacity=".92"/>
    <line x1="76" y1="16" x2="76" y2="40" stroke="${ORANGE}" stroke-width="7" stroke-linecap="round"/>
    <line x1="64" y1="28" x2="88" y2="28" stroke="${ORANGE}" stroke-width="7" stroke-linecap="round"/>
  </svg>`

  const insightsBlock =
    insights.length > 0
      ? `<div style="padding:8px 44px 4px;">
          <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:${WARM};font-weight:700;margin-bottom:12px;">Insights</div>
          ${insights
            .map(
              (ins) => `<table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="width:22px;vertical-align:top;color:${ORANGE};font-size:14px;line-height:1.6;">&#10022;</td>
                <td style="font-size:14px;color:#1f2937;line-height:1.7;padding-bottom:10px;">${esc(ins)}</td>
              </tr></table>`
            )
            .join('')}
        </div>`
      : ''

  const actionsBlock =
    actions.length > 0
      ? `<div style="padding:14px 44px 8px;">
          <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:${WARM};font-weight:700;margin-bottom:4px;">Action items</div>
          <div style="font-size:12px;color:${WARM};margin-bottom:14px;">Tap the box to mark one done — it logs back with your coach.</div>
          ${actions
            .map(
              (a) => `<table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="padding:9px 14px 9px 0;vertical-align:top;">
                  <a href="${esc(a.url)}" style="display:inline-block;width:18px;height:18px;border:2px solid ${NAVY};border-radius:4px;text-decoration:none;font-size:1px;line-height:18px;">&nbsp;</a>
                </td>
                <td style="font-size:14px;color:#1f2937;line-height:1.6;padding:7px 0;border-bottom:1px solid #e5e0d8;">${esc(a.description)}</td>
              </tr></table>`
            )
            .join('')}
        </div>`
      : ''

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(160deg,${NAVY_DEEP} 0%,${NAVY} 100%);padding:32px 44px 26px;text-align:center;">
      <div style="margin-bottom:12px;">${logo}</div>
      <div style="color:${WARM};font-size:9px;letter-spacing:5px;text-transform:uppercase;">theLeadershipWell</div>
    </div>
    <div style="padding:26px 44px 8px;">
      ${paragraphs(bodyText)}
    </div>
    ${insightsBlock}
    ${actionsBlock}
    <div style="background:${NAVY_DEEP};padding:14px 44px;text-align:center;font-size:11px;color:${WARM};letter-spacing:1px;margin-top:18px;">
      theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; Prepared for ${esc(clientName)}
    </div>
  </div>
</body></html>`
}
