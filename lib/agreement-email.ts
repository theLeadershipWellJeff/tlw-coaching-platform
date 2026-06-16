/**
 * HTML email for a coaching agreement sent to a client to sign. Shows the
 * agreement body (coach-authored) and a prominent "I have read and agree"
 * checkbox link — tapping it signs the agreement (the token is the credential),
 * mirroring the action-completion loop.
 */
const NAVY = '#0C1940'
const NAVY_DEEP = '#111226'
const CREAM = '#F2F2F0'
const WARM = '#8B8680'
const ORANGE = '#E8650A'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildAgreementEmailHTML(opts: {
  clientName: string
  title: string
  bodyHtml: string
  signUrl: string
}): string {
  const { clientName, title, bodyHtml, signUrl } = opts

  const logo = `<svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="62,10 10,10 10,90 90,90 90,46" stroke="${CREAM}" stroke-width="7" fill="none" stroke-linecap="square" stroke-opacity=".92"/>
    <line x1="76" y1="16" x2="76" y2="40" stroke="${ORANGE}" stroke-width="7" stroke-linecap="round"/>
    <line x1="64" y1="28" x2="88" y2="28" stroke="${ORANGE}" stroke-width="7" stroke-linecap="round"/>
  </svg>`

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(160deg,${NAVY_DEEP} 0%,${NAVY} 100%);padding:30px 44px 24px;text-align:center;">
      <div style="margin-bottom:10px;">${logo}</div>
      <div style="color:${WARM};font-size:9px;letter-spacing:5px;text-transform:uppercase;">theLeadershipWell</div>
    </div>

    <div style="padding:26px 44px 6px;">
      <p style="margin:0 0 14px;font-size:14px;color:#1f2937;line-height:1.7;">Hi ${esc(clientName.split(' ')[0] || 'there')},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#1f2937;line-height:1.7;">Please review the agreement below. When you're ready, tap the box at the bottom to confirm you've read and agree.</p>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${WARM};font-weight:700;margin-bottom:8px;">${esc(title)}</div>
      <div style="border:1px solid #e5e0d8;border-radius:8px;padding:18px 20px;font-size:14px;color:#1f2937;line-height:1.7;">
        ${bodyHtml}
      </div>
    </div>

    <div style="padding:20px 44px 8px;">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:14px;vertical-align:middle;">
          <a href="${esc(signUrl)}" style="display:inline-block;width:22px;height:22px;border:2px solid ${NAVY};border-radius:4px;text-decoration:none;font-size:1px;line-height:22px;">&nbsp;</a>
        </td>
        <td style="font-size:14px;color:#111226;font-weight:600;line-height:1.5;">
          <a href="${esc(signUrl)}" style="color:#111226;text-decoration:none;">I have read and agree to this agreement</a>
          <div style="font-size:12px;color:${WARM};font-weight:400;">Tap the box to sign &mdash; it records your agreement with your coach.</div>
        </td>
      </tr></table>
    </div>

    <div style="background:${NAVY_DEEP};padding:14px 44px;text-align:center;font-size:11px;color:${WARM};letter-spacing:1px;margin-top:18px;">
      theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; ${esc(clientName)}
    </div>
  </div>
</body></html>`
}
