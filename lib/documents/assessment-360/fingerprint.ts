/**
 * Layout detection (build prompt §5c). The parser is calibrated against ONE
 * layout — the 2024 Extraordinary Leader feedback report. An unknown layout is
 * reported as unsupported and never parsed: a wrong number is far worse than a
 * missing one. Add layouts as real reports arrive and fail here.
 *
 * The fingerprint is structural (which sections exist, where the tables' column
 * headers sit, that a band legend is printed), not the copyright year — a 2025
 * report with the same layout should parse; a differently laid-out 2024 one
 * should not.
 *
 * Two layouts are supported (2026-09-22):
 *  - the initial feedback report (`extraordinary-leader/2024`);
 *  - the FOLLOW-UP feedback report (`extraordinary-leader/2024-followup`) — a
 *    reassessment, same sections plus "Reassessment vs Previous Assessment
 *    Results", with the previous administration's score printed as a second,
 *    tan bar under every current one and its rater-counts sentence worded
 *    "The most recent assessment results include feedback from:". The parser
 *    reads the current scores and keeps the previous ones in a separate
 *    `reassessment` block; it never mixes the two.
 */
import { rowsOf, type PageData } from '../geometry'

export const SUPPORTED_FORMAT = 'extraordinary-leader/2024'
export const SUPPORTED_FOLLOWUP_FORMAT = 'extraordinary-leader/2024-followup'

export type Fingerprint = {
  supported: boolean
  version: string
  /** True for the follow-up (reassessment) layout. */
  followUp: boolean
  copyrightYear: string | null
  missing: string[]
}

/** The initial report's rater-counts sentence. */
export const INITIAL_COUNTS_RE = /includes feedback received from/i
/** The follow-up report's rater-counts sentence (one block for the most recent, one for the prior administration). */
export const FOLLOWUP_COUNTS_RE = /most recent assessment results include feedback from/i
export const FOLLOWUP_SECTION_RE = /Reassessment vs Previous Assessment Results/

const REQUIRED_TITLES: Array<[string, RegExp]> = [
  ['Overall Leadership Effectiveness', /Overall Leadership Effectiveness/],
  ['Leadership Tent', /Leadership Tent/],
  ['Differentiating Competency Rankings', /Differentiating Competency Rankings/],
  ['Highest Scored Behaviors', /Highest Scored Behaviors/],
  ['Importance Ratings and Leadership Passions', /Importance Ratings and Leadership Passions/],
  ['Lowest Scored Behaviors', /Lowest Scored Behaviors/],
  ['Differentiating Competency Gap Analysis', /Differentiating Competency Gap Analysis/],
  ['Differentiating Competency Score Details', /Differentiating Competency Score Details/],
]

export function fingerprintAssessment360(pages: PageData[]): Fingerprint {
  const missing: string[] = []
  const titles = pages.map((p) =>
    rowsOf(p.text)
      .filter((r) => r.y > 35 && r.y < 62)
      .map((r) => r.text)
      .join(' | ')
  )
  const allText = pages.map((p) => rowsOf(p.text).map((r) => r.text).join('\n')).join('\n')

  if (!/EXTRAORDINARY/i.test(allText) || !/Feedback Report/i.test(allText)) missing.push('cover: Extraordinary Leader feedback report')
  for (const [name, re] of REQUIRED_TITLES) if (!titles.some((t) => re.test(t))) missing.push(`section: ${name}`)
  // The follow-up layout is recognised by BOTH its rater-counts wording and its
  // extra section; one without the other is an unknown layout, not a guess.
  const followUpCounts = FOLLOWUP_COUNTS_RE.test(allText)
  const followUpSection = titles.some((t) => FOLLOWUP_SECTION_RE.test(t))
  const followUp = followUpCounts && followUpSection
  if (!INITIAL_COUNTS_RE.test(allText) && !followUp) {
    missing.push(
      followUpCounts || followUpSection
        ? `rater counts line (follow-up wording ${followUpCounts ? 'found' : 'missing'}, "Reassessment vs Previous" section ${followUpSection ? 'found' : 'missing'})`
        : 'rater counts line'
    )
  }

  const rankingsPage = pages[titles.findIndex((t) => /Differentiating Competency Rankings/.test(t))]
  if (rankingsPage) {
    const legendRows = rowsOf(rankingsPage.text).filter((r) => /^(Profound Strength|Promising Profound Strength|Above Average|Below Average|Potential Fatal Flaw)/.test(r.text) && / - /.test(r.text))
    if (legendRows.length < 5) missing.push('band legend on rankings page')
    const bars = rankingsPage.shapes.filter((s) => s.h >= 8 && s.h <= 16 && s.w >= 30)
    if (bars.length < 10) missing.push('ranking bars (vector)')
    const markers = rankingsPage.shapes.filter((s) => s.w >= 3 && s.w <= 9 && s.h >= 3 && s.h <= 9)
    if (markers.length < 20) missing.push('percentile markers (vector)')
  }
  const behaviorsPage = pages[titles.findIndex((t) => /Highest Scored Behaviors/.test(t))]
  if (behaviorsPage) {
    const header = rowsOf(behaviorsPage.text).find((r) => /Manager/.test(r.text) && /Total/.test(r.text) && /Peers/.test(r.text) && /Self/.test(r.text))
    if (!header) missing.push('behaviors table header (Total/Manager/Peers/Others/Self)')
  }

  const year = allText.match(/Copyright © (\d{4}) Zenger Folkman/)?.[1] ?? null
  const supported = missing.length === 0
  return {
    supported,
    version: supported ? (followUp ? SUPPORTED_FOLLOWUP_FORMAT : SUPPORTED_FORMAT) : 'unknown',
    followUp: supported && followUp,
    copyrightYear: year,
    missing,
  }
}
