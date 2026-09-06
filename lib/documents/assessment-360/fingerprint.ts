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
 */
import { rowsOf, type PageData } from '../geometry'

export const SUPPORTED_FORMAT = 'extraordinary-leader/2024'

export type Fingerprint = {
  supported: boolean
  version: string
  copyrightYear: string | null
  missing: string[]
}

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
  if (!/includes feedback received from/i.test(allText)) missing.push('rater counts line')

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
  return {
    supported: missing.length === 0,
    version: missing.length === 0 ? SUPPORTED_FORMAT : 'unknown',
    copyrightYear: year,
    missing,
  }
}
