/**
 * Branded HTML emails for scheduled sessions: the booking confirmation (sent at
 * schedule time) and the ~24h-before nudge. Same shell as the agreement email so
 * the client sees a consistent theLeadershipWell look. The "when" label is
 * pre-formatted by the caller in the client's (or coach's) timezone.
 */
const NAVY = '#0C1940'
const NAVY_DEEP = '#111226'
const CREAM = '#F2F2F0'
const WARM = '#8B8680'
const ORANGE = '#E8650A'

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildAppointmentEmailHTML(opts: {
  kind: 'confirmation' | 'nudge'
  clientName: string
  coachName: string
  whenLabel: string
}): string {
  const { kind, clientName, coachName, whenLabel } = opts
  const first = clientName.split(' ')[0] || 'there'

  const heading = kind === 'confirmation' ? 'Your next session is booked' : 'A reminder about our session'
  const lead =
    kind === 'confirmation'
      ? `Thanks for our time today. I've scheduled our next session — you'll find it on your calendar, and the details are below.`
      : `Looking forward to our session coming up. Here are the details so it's easy to find.`

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
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${WARM};font-weight:700;margin-bottom:10px;">${esc(heading)}</div>
      <p style="margin:0 0 14px;font-size:14px;color:#1f2937;line-height:1.7;">Hi ${esc(first)},</p>
      <p style="margin:0 0 18px;font-size:14px;color:#1f2937;line-height:1.7;">${esc(lead)}</p>

      <div style="border:1px solid #e5e0d8;border-radius:8px;padding:18px 20px;margin-bottom:8px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${WARM};font-weight:700;margin-bottom:6px;">Session</div>
        <div style="font-size:17px;color:${NAVY};font-weight:600;line-height:1.5;">${esc(whenLabel)}</div>
      </div>
    </div>

    <div style="padding:8px 44px 22px;">
      <p style="margin:14px 0 0;font-size:14px;color:#1f2937;line-height:1.7;">See you then,<br/>${esc(coachName)}</p>
    </div>

    <div style="background:${NAVY_DEEP};padding:14px 44px;text-align:center;font-size:11px;color:${WARM};letter-spacing:1px;">
      theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; ${esc(clientName)}
    </div>
  </div>
</body></html>`
}
