/**
 * The instrument's own four-condition test for a Fatal Flaw (as opposed to
 * the Potential Fatal Flaw BAND, which is only condition 1). From the
 * participant report's development section, transcribed 2026-09-24:
 *
 *   Do you have a competency that meets all four conditions?
 *   1. identified as a Potential Fatal Flaw — shows in yellow (Section 9);
 *   2. included among the most important competencies for the organization
 *      (Section 12);
 *   3. your lowest scored behaviors point to the same competency (Section 14);
 *   4. your raters have emphasized it as a Potential Fatal Flaw in their
 *      written comments (Section 15).
 *
 * Conditions 1–3 are answered from the structured data; condition 4 is a
 * reading of the comments and is left to the participant and the assistant
 * (the verbatims travel in the same prompt). This matches theLeadershipWell's
 * ruling (rubric 04 §5): a low band without the organisation's need is not a
 * fatal flaw for this role.
 */
import type { Assessment360Data } from './types'

export type FatalFlawCondition = 'met' | 'not_met' | 'partial'

export type FatalFlawRow = {
  competency: string
  total: number
  /** Condition 1 — always met for a row (only band members are listed). */
  in_band: true
  /** Condition 2 — importance votes and where the competency sits in the importance list. */
  importance: { votes: number; rank_by_votes: number; of: number; status: FatalFlawCondition }
  /** Condition 3 — the lowest-scored behaviors that fall under this competency. */
  lowest_behaviors: { items: number[]; status: FatalFlawCondition }
  /** Condition 4 — how many potential-fatal-flaw comments the report carries; the reading is a judgment. */
  comments: { count: number; status: 'to_read' }
  /** Conditions met from the data (0–3 of the first three). */
  data_conditions_met: number
}

/** "Among the most important" — the report gives no cutoff; the top third of the importance list (ties included) with at least one vote reads as met, no votes as not met, anything else as partial. */
export const IMPORTANCE_TOP_RANK = 6

export function fatalFlawCheck(data: Assessment360Data): FatalFlawRow[] {
  const band = data.competency_rankings.filter((r) => r.band === 'Potential Fatal Flaw').sort((a, b) => a.rank - b.rank)
  if (!band.length) return []
  const byVotes = [...data.importance].sort((a, b) => b.total_votes - a.total_votes)
  const rankByVotes = (competency: string): { votes: number; rank: number } => {
    const row = data.importance.find((i) => i.competency === competency)
    const votes = row?.total_votes ?? 0
    // competition ranking: 1 + the number of competencies with strictly more votes
    const rank = 1 + byVotes.filter((i) => i.total_votes > votes).length
    return { votes, rank }
  }
  const pffComments = Object.values(data.verbatims.potential_fatal_flaws).reduce((n, list) => n + (list?.length ?? 0), 0)
  return band.map((r) => {
    const { votes, rank } = rankByVotes(r.competency)
    const importanceStatus: FatalFlawCondition = votes === 0 ? 'not_met' : rank <= IMPORTANCE_TOP_RANK ? 'met' : 'partial'
    const items = data.lowest_behaviors.filter((b) => b.competency === r.competency).map((b) => b.item_number ?? -1).filter((n) => n > 0)
    const lowestStatus: FatalFlawCondition = items.length ? 'met' : 'not_met'
    return {
      competency: r.competency,
      total: r.total,
      in_band: true,
      importance: { votes, rank_by_votes: rank, of: data.importance.length, status: importanceStatus },
      lowest_behaviors: { items, status: lowestStatus },
      comments: { count: pffComments, status: 'to_read' },
      data_conditions_met: 1 + (importanceStatus === 'met' ? 1 : 0) + (lowestStatus === 'met' ? 1 : 0),
    }
  })
}

const STATUS_WORD: Record<FatalFlawCondition, string> = { met: 'met', not_met: 'not met', partial: 'partly' }

/** The test as prompt text for one report — only meaningful when the band holds a competency. */
export function renderFatalFlawCheck(data: Assessment360Data): string {
  const rows = fatalFlawCheck(data)
  if (!rows.length) {
    return "FATAL FLAW TEST (the report's own four conditions — see the reading guide): no competency sits in the Potential Fatal Flaw band, so condition 1 fails for every competency and the test does not apply. A Potential Fatal Flaw comment on its own is a theme to hold, never a fatal flaw."
  }
  const lines: string[] = []
  const comments = rows[0].comments.count
  lines.push(
    `FATAL FLAW TEST (the report's own four conditions — a competency is a Fatal Flaw only when ALL FOUR hold; the band alone is condition 1). Per row: (1) in the band · (2) among the organisation's most important (importance votes, rank of ${rows[0].importance.of} by votes) · (3) the lowest-scored behaviors point to it · then "data: n of 3". Condition 4 — whether the raters emphasized it in their Potential Fatal Flaw comments (Section 15; ${comments} comment${comments === 1 ? '' : 's'} there, in this prompt) — is a reading the participant makes with you, never a verdict you hand down:`,
  )
  for (const r of rows) {
    lines.push(
      `- ${r.competency} ${r.total.toFixed(2)}: (1) met · (2) ${STATUS_WORD[r.importance.status]} (${r.importance.votes} vote${r.importance.votes === 1 ? '' : 's'}, rank ${r.importance.rank_by_votes}) · (3) ${STATUS_WORD[r.lowest_behaviors.status]}${r.lowest_behaviors.items.length ? ` (${r.lowest_behaviors.items.map((n) => `#${n}`).join(', ')})` : ''} · data: ${r.data_conditions_met} of 3`,
    )
  }
  return lines.join('\n')
}
