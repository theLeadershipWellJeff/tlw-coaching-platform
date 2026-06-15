export interface PrepContent {
  coachingPlan: { emoji: string; title: string; description: string }[]
  exploring: { title: string; description: string }[]
  insights: string[]
  actions: string[]
  questions: { theme: string; question: string }[]
  closingLine: string
  quote: { text: string; author: string }
}

// `actionLinks` is aligned by index with `c.actions`: when an entry is a URL,
// that action's checkbox becomes a click-to-log link (same system as the note
// "send to client" flow); a null entry renders a plain box.
export function buildClientEmailHTML(
  clientName: string,
  c: PrepContent,
  actionLinks: (string | null)[] = []
): string {
  const anyActionLinks = actionLinks.some(Boolean)
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
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:300;color:#F2F2F0;margin-bottom:16px;line-height:1.15;">Your Session Preparation</div>
    <div style="width:48px;height:1px;background:#8B8680;margin:0 auto 14px;"></div>
    <div style="color:#8B8680;font-size:9px;letter-spacing:4px;text-transform:uppercase;margin-bottom:6px;">Prepared For You</div>
    <div style="color:#F2F2F0;font-size:14px;letter-spacing:.5px;font-weight:500;">${clientName} &nbsp;&middot;&nbsp; theLeadershipWell</div>
  </div>

  <!-- QUOTE -->
  <div style="background:rgba(17,18,38,.04);border-top:1px solid #e5e0d8;border-bottom:1px solid #e5e0d8;padding:18px 44px;text-align:center;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:15px;color:#403832;line-height:1.75;">&ldquo;${c.quote.text}&rdquo;</div>
    <div style="font-size:10px;color:#8B8680;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">&mdash; ${c.quote.author}</div>
  </div>

  <div style="height:1px;margin:20px 44px;background:linear-gradient(to right,transparent,rgba(139,134,128,.4),transparent);"></div>

  <!-- COACHING PLAN -->
  <div style="padding:20px 44px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:6px;">Your Coaching Plan</div>
    <div style="font-size:12px;color:#8B8680;margin-bottom:16px;">The areas we&rsquo;re working on together this season</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${c.coachingPlan.map(item => `
      <tr><td style="padding:13px 0;border-bottom:1px solid #e5e0d8;vertical-align:top;">
        <table width="100%"><tr>
          <td width="40" style="vertical-align:top;padding-right:14px;padding-top:2px;">
            <div style="width:32px;height:32px;border-radius:50%;background:#0C1940;text-align:center;line-height:32px;font-size:15px;">${item.emoji}</div>
          </td>
          <td>
            <div style="font-weight:600;font-size:14px;color:#111226;margin-bottom:3px;">${item.title}</div>
            <div style="font-size:13px;color:#6b7280;line-height:1.65;">${item.description}</div>
          </td>
        </tr></table>
      </td></tr>`).join('')}
    </table>
  </div>
  <div style="height:1px;margin:0 44px;background:#e5e0d8;"></div>

  <!-- EXPLORING -->
  <div style="padding:20px 44px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:16px;">What We Have Been Exploring</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${c.exploring.map((item, i) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e5e0d8;vertical-align:top;">
        <table width="100%"><tr>
          <td width="34" style="padding-right:14px;vertical-align:top;">
            <div style="width:26px;height:26px;border-radius:50%;background:#0C1940;text-align:center;line-height:26px;font-family:Georgia,serif;font-size:13px;color:#F2F2F0;">${i + 1}</div>
          </td>
          <td>
            <div style="font-weight:600;font-size:14px;color:#111226;margin-bottom:3px;">${item.title}</div>
            <div style="font-size:13px;color:#6b7280;line-height:1.65;">${item.description}</div>
          </td>
        </tr></table>
      </td></tr>`).join('')}
    </table>
  </div>
  <div style="height:1px;margin:0 44px;background:#e5e0d8;"></div>

  <!-- INSIGHTS -->
  <div style="padding:20px 44px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:16px;">Past Key Insights</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${c.insights.map(ins => `
      <tr><td style="padding:11px 0;border-bottom:1px solid #e5e0d8;">
        <table><tr>
          <td style="padding-right:14px;font-size:12px;color:#8B8680;vertical-align:top;padding-top:3px;">&#10022;</td>
          <td style="font-size:14px;color:#1f2937;line-height:1.82;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;">${ins}</td>
        </tr></table>
      </td></tr>`).join('')}
    </table>
  </div>
  <div style="height:1px;margin:0 44px;background:#e5e0d8;"></div>

  <!-- ACTIONS -->
  <div style="padding:20px 44px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:6px;">Your Action Items</div>
    <div style="font-size:12px;color:#8B8680;margin-bottom:14px;">${anyActionLinks ? 'Tap a box to mark one done &mdash; it logs back with your coach.' : 'From our last sessions &mdash; how did these land?'}</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${c.actions.map((act, i) => {
        const url = actionLinks[i]
        const box = url
          ? `<a href="${url}" style="display:inline-block;width:16px;height:16px;border:2px solid #0C1940;border-radius:3px;text-decoration:none;font-size:1px;line-height:16px;">&nbsp;</a>`
          : `<div style="width:16px;height:16px;border:2px solid #0C1940;border-radius:3px;"></div>`
        return `
      <tr><td style="padding:11px 0;border-bottom:1px solid #e5e0d8;">
        <table><tr>
          <td style="padding-right:14px;vertical-align:top;padding-top:3px;">${box}</td>
          <td style="font-size:14px;color:#1f2937;line-height:1.65;">${act}</td>
        </tr></table>
      </td></tr>`
      }).join('')}
    </table>
  </div>
  <div style="height:1px;margin:0 44px;background:#e5e0d8;"></div>

  <!-- QUESTIONS -->
  <div style="padding:20px 44px;">
    <div style="font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:6px;">Three Questions to Sit With</div>
    <div style="font-size:12px;color:#8B8680;margin-bottom:16px;">Give yourself 5 quiet minutes before we meet:</div>
    ${c.questions.map((q, i) => `
    <div style="background:#111226;padding:18px 22px;margin:10px 0;border-radius:6px;border-left:3px solid #8B8680;">
      <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8B8680;font-weight:700;margin-bottom:8px;">Question ${i + 1} &mdash; ${q.theme}</div>
      <div style="font-size:15px;color:#F2F2F0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;line-height:1.8;">${q.question}</div>
    </div>`).join('')}
  </div>

  <!-- SIGNATURE -->
  <div style="padding:20px 44px 34px;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:15px;color:#1f2937;line-height:1.9;font-style:italic;margin-bottom:22px;">${c.closingLine}</div>
    <table><tr>
      <td style="padding-right:14px;vertical-align:middle;">
        <svg width="38" height="38" viewBox="0 0 100 100" fill="none">
          <polyline points="62,10 10,10 10,90 90,90 90,46" stroke="#0C1940" stroke-width="7" fill="none" stroke-linecap="square"/>
          <line x1="76" y1="16" x2="76" y2="40" stroke="#8B8680" stroke-width="7" stroke-linecap="round"/>
          <line x1="64" y1="28" x2="88" y2="28" stroke="#8B8680" stroke-width="7" stroke-linecap="round"/>
        </svg>
      </td>
      <td>
        <div style="font-weight:700;font-size:14px;color:#111226;">Jeff Holmes</div>
        <div style="font-size:12px;color:#8B8680;margin-top:1px;">Executive Coach &middot; theLeadershipWell</div>
      </td>
    </tr></table>
  </div>

  <!-- FOOTER -->
  <div style="background:#111226;padding:14px 44px;text-align:center;font-size:11px;color:#8B8680;letter-spacing:1px;">
    theLeadershipWell &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; Prepared for ${clientName}
  </div>

</div>
</body>
</html>`
}
