/**
 * HTML email of a scored session report — the coach's own scorecard, sent after
 * each session is scored (roadmap: emailed scorecard). Built to the same
 * theLeadershipWell design language as the client prep email
 * (lib/email-template.ts) but rendering the §16 engine output. Client identity
 * is initials only (spec §3 privacy).
 */
import type { Band, Flag, SessionReportJson } from './scoring/types'
import { bandFamily, bandReference } from './scoring/rubric'

const BAND_HEX: Record<'success' | 'info' | 'warning', string> = {
  success: '#3F7250',
  info: '#3A567E',
  warning: '#B07A1E',
}

function bandHex(band: Band): string {
  return BAND_HEX[bandFamily(band)]
}

function flagHex(flag: Flag | null | undefined): string {
  if (flag === 'red') return '#B4451F'
  if (flag === 'amber') return '#B07A1E'
  if (flag === 'green') return '#3F7250'
  return '#8B8680'
}

/** HTML-escape model-generated text before interpolating it into the template. */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return esc(d)
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function bandChip(band: Band, score: number): string {
  const color = bandHex(band)
  return `<span style="display:inline-block;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;color:${color};background:#F1EFEC;white-space:nowrap;">${esc(
    band.toLowerCase()
  )} &middot; ${score.toFixed(1)}</span>`
}

function metricCell(label: string, value: string, flag: Flag | null | undefined, status?: string): string {
  const color = flagHex(flag)
  return `<td width="50%" style="padding:8px;vertical-align:top;">
    <div style="background:#F6F5F3;border-radius:6px;padding:14px 16px;">
      <div style="font-size:11px;color:#8B8680;">${esc(label)}</div>
      <div style="font-size:22px;font-weight:600;color:${color};line-height:1.1;margin-top:6px;">${esc(value)}</div>
      ${status ? `<div style="font-size:11px;color:${color};margin-top:5px;">${esc(status)}</div>` : ''}
    </div>
  </td>`
}

export function buildScorecardEmailHTML(report: SessionReportJson): string {
  const s = report.session
  const m = report.metrics
  const overallColor = bandHex(report.band)
  const ref = bandReference(report.band)

  const sessionLine = [
    s.session_number != null
      ? `Session ${s.session_number}${s.engagement_total != null ? ` of ${s.engagement_total}` : ''}`
      : null,
    s.type || null,
  ]
    .filter(Boolean)
    .map(esc)
    .join(' &middot; ')

  const competencyRows = report.competencies
    .map(
      (c) => `
      <tr><td style="padding:13px 0;border-bottom:1px solid #e5e0d8;vertical-align:top;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;padding-right:12px;">
            <div style="font-size:13px;color:#111226;font-weight:600;"><span style="color:#8B8680;">${c.id}.</span> ${esc(
        c.name
      )}</div>
            ${c.evidence ? `<div style="font-size:12px;color:#6b7280;line-height:1.6;margin-top:3px;">${esc(c.evidence)}</div>` : ''}
          </td>
          <td width="96" style="text-align:right;vertical-align:top;">${bandChip(c.band, c.score)}</td>
        </tr></table>
      </td></tr>`
    )
    .join('')

  const metricsBlock =
    m.source === 'unavailable'
      ? `<div style="background:#F6F5F3;border-radius:6px;padding:16px;font-size:12px;color:#8B8680;line-height:1.65;">
           Conversation metrics are unavailable &mdash; this transcript wasn&rsquo;t speaker-separated, so talk-time and turn-level signals couldn&rsquo;t be computed.
         </div>`
      : `<table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${metricCell(
              'Coach talk time',
              m.coach_talk_time_pct != null ? `${m.coach_talk_time_pct}%` : '—',
              m.coach_talk_time_flag,
              m.coach_talk_time_flag === 'red' ? 'above the 40% guide' : m.coach_talk_time_pct != null ? 'within guide' : undefined
            )}
            ${metricCell(
              'Flagged emotion',
              m.flagged_emotion_count != null ? String(m.flagged_emotion_count) : '—',
              m.flagged_emotion_flag,
              'attunement moves'
            )}
          </tr>
          <tr>
            ${metricCell(
              'Feeling explorations',
              m.feeling_explorations != null ? String(m.feeling_explorations) : '—',
              m.feeling_explorations_flag,
              'stayed with a feeling'
            )}
            ${metricCell(
              'Questions : statements',
              m.question_to_statement || '—',
              m.question_to_statement_flag,
              undefined
            )}
          </tr>
          ${
            m.consultant_moves
              ? `<tr>${metricCell(
                  'Consultant moves',
                  String(m.consultant_moves.count),
                  m.consultant_moves.count_flag,
                  m.consultant_moves.count > 3 ? 'mode drift (>3)' : 'within coaching mode'
                )}${metricCell(
                  'Reflective pauses',
                  m.reflective_pauses != null ? String(m.reflective_pauses) : '—',
                  null,
                  undefined
                )}</tr>`
              : ''
          }
        </table>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:20px;background:#DDD9D3;font-family:'DM Sans',sans-serif;">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- HEADER -->
  <div style="background:linear-gradient(160deg,#111226 0%,#0C1940 100%);padding:40px 44px 30px;text-align:center;">
    <div style="margin-bottom:16px;">
      <svg width="56" height="56" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polyline points="62,10 10,10 10,90 90,90 90,46" stroke="#F2F2F0" stroke-width="7" fill="none" stroke-linecap="square" stroke-opacity=".92"/>
        <line x1="76" y1="16" x2="76" y2="40" stroke="#8B8680" stroke-width="7" stroke-linecap="round"/>
        <line x1="64" y1="28" x2="88" y2="28" stroke="#8B8680" stroke-width="7" stroke-linecap="round"/>
      </svg>
    </div>
    <div style="color:#8B8680;font-size:9px;letter-spacing:5px;text-transform:uppercase;margin-bottom:14px;">theLeadershipWell</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:300;color:#F2F2F0;margin-bottom:16px;line-height:1.15;">Session Scorecard</div>
    <div style="width:48px;height:1px;background:#8B8680;margin:0 auto 14px;"></div>
    <div style="color:#F2F2F0;font-size:14px;letter-spacing:.5px;font-weight:500;">${esc(s.client_initials || '—')} &nbsp;&middot;&nbsp; ${fmtDate(
    s.date
  )}</div>
    ${sessionLine ? `<div style="color:#8B8680;font-size:11px;letter-spacing:1px;margin-top:6px;">${sessionLine}</div>` : ''}
  </div>

  <!-- OVERALL -->
  <div style="padding:28px 44px 22px;text-align:center;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:10px;">Overall</div>
    <div style="font-size:52px;font-weight:600;color:${overallColor};line-height:1;">${report.overall_score.toFixed(1)}</div>
    <div style="margin-top:10px;">
      <span style="display:inline-block;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;color:${overallColor};background:#F1EFEC;">${esc(
    report.band.toLowerCase()
  )}${ref ? ` &middot; ${esc(ref)}` : ''}</span>
    </div>
    <div style="font-size:11px;color:#8B8680;margin-top:12px;">1 emerging &middot; 3 proficient (PCC) &middot; 5 masterful (MCC)</div>
  </div>

  <!-- COMPETENCIES -->
  <div style="padding:8px 44px 4px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:8px;">The eight competencies</div>
    <table width="100%" cellpadding="0" cellspacing="0">${competencyRows}</table>
  </div>

  <!-- METRICS -->
  <div style="padding:18px 36px 4px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin:0 8px 10px;">Conversation signals</div>
    ${metricsBlock}
  </div>

  <!-- THE WIN -->
  <div style="padding:18px 44px 8px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:14px;">This session</div>
    ${
      report.win.went_well
        ? `<div style="margin-bottom:14px;">
        <div style="font-size:11px;color:#3F7250;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">What went well</div>
        <div style="font-size:14px;color:#1f2937;line-height:1.65;">${esc(report.win.went_well)}</div>
      </div>`
        : ''
    }
    ${
      report.win.improve
        ? `<div style="margin-bottom:14px;">
        <div style="font-size:11px;color:#B07A1E;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">One shift to make</div>
        <div style="font-size:14px;color:#1f2937;line-height:1.65;">${esc(report.win.improve)}</div>
      </div>`
        : ''
    }
    ${
      report.win.next_step
        ? `<div style="background:#111226;padding:18px 22px;margin-top:6px;border-radius:6px;border-left:3px solid #8B8680;">
        <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:8px;">Next step</div>
        <div style="font-size:15px;color:#F2F2F0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;line-height:1.7;">${esc(
          report.win.next_step
        )}</div>
      </div>`
        : ''
    }
  </div>

  <!-- FOOTER -->
  <div style="background:#111226;padding:14px 44px;text-align:center;font-size:11px;color:#8B8680;letter-spacing:1px;margin-top:18px;">
    theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; Coaching craft scorecard
  </div>

</div>
</body>
</html>`
}
