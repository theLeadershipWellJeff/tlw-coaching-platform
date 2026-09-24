/**
 * Zenger Folkman's own reading guide from the participant report — the seven
 * "Extraordinary Insights" and the section-by-section "Explore Your Report"
 * questions — transcribed into `report-guide.json` so the assistant can answer
 * "how should I read my report?" in the instrument's own words.
 *
 * Vendor material (© 2024 Zenger Folkman, EL60.1D.4), licensed to
 * theLeadershipWell for its participants; cited as Zenger Folkman's. Small
 * (~1k tokens) and cross-client, so it rides in the cached system prefix of
 * every 360 conversation next to the Strength Builder index.
 *
 * The human-readable copy is rendered into
 * `rubrics/05_zf360_strength_builders_reference.md` by
 * `scripts/rubrics/render-strength-builders.js`.
 */
import guide from './report-guide.json'

export type ReportGuideInsight = { title: string; text: string }
export type ReportGuideStep = { title: string; section: string | null; questions: string[] }
export type ReportGuide = {
  source: string
  transcription_note: string
  insights: { intro: string[]; items: ReportGuideInsight[] }
  explore: { intro: string; complete: boolean; steps: ReportGuideStep[] }
  /** The report's own four-condition test — a Fatal Flaw is more than the band. */
  fatal_flaw_test: { title: string; question: string; conditions: string[] }
}

export const REPORT_GUIDE: ReportGuide = guide as ReportGuide

/** The guide as prompt text: the seven insights, then the reading steps with their questions. */
export function reportGuideText(): string {
  const g = REPORT_GUIDE
  const lines: string[] = []
  lines.push(
    "HOW THE REPORT ASKS TO BE READ (Zenger Folkman's own guide, printed in every participant report — use it when they ask how to read or approach their report, and cite it as Zenger Folkman's):",
  )
  lines.push(`Seven insights on what enables leaders to become extraordinary: ${g.insights.items.map((i, n) => `${n + 1}) ${i.title} — ${i.text}`).join(' ')}`)
  lines.push(`Explore your report (the report's own section-by-section questions${g.explore.complete ? '' : ' — the later sections of this guide have not been transcribed yet; say so if asked past the ones here'}):`)
  for (const s of g.explore.steps) {
    lines.push(`- ${s.title}${s.section ? ` (report section${s.section.includes(',') ? 's' : ''} ${s.section})` : ''}: ${s.questions.join(' ')}`)
  }
  lines.push(`${g.fatal_flaw_test.title} (the report's own test — a competency is a Fatal Flaw only when ALL FOUR hold; the yellow band alone is condition 1): ${g.fatal_flaw_test.question} ${g.fatal_flaw_test.conditions.map((c, n) => `${n + 1}) ${c}`).join(' ')} The FATAL FLAW TEST block in the participant's data pre-checks conditions 1–3; condition 4 is read from their comments with them.`)
  return lines.join('\n')
}
