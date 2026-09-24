/**
 * The 360 report as the assistant reads it — a compact, deterministic text
 * rendering of `Assessment360Data` that carries EVERY number the report prints
 * (rater counts, overall by group with norms, engagement, the tent, all 19
 * rankings with band / norms / votes / passion / self / gap, the highest and
 * lowest behaviors, the marked gaps, the three-circle candidates, every
 * behavior item by competency with its per-group scores, the follow-up
 * report's reassessment table and the platform's own comparison) in roughly a
 * quarter of the tokens of the raw JSON.
 *
 * Why: the raw JSON dump ran ~12–13k tokens, and the snapshot slice of the
 * portal context is capped (lib/ai/context-budget.ts). A clipped JSON string
 * lost the competency-details tail, the development candidates, the verbatim
 * comments, the goals and the notes — the second half of the report, silently.
 * Text tables at ~3.5k tokens fit, and read better to the model than JSON keys.
 *
 * Pure. Verbatim rater comments are rendered separately (prompt.ts) so the
 * numbers and the comments keep their own sections.
 */
import type { Assessment360Data, Band, RaterCounts, RaterGroup } from '@/lib/documents/assessment-360/types'
import { renderFatalFlawCheck } from '../documents/assessment-360/fatal-flaw'

const fmt = (n: number | null | undefined): string => (n == null ? '—' : n.toFixed(2))
const signed = (n: number | null | undefined): string => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`)

const GROUP_ORDER: RaterGroup[] = ['Manager', 'Peers', 'Direct Reports', 'Others', 'Self']
const ABBR: Record<RaterGroup, string> = { Manager: 'M', Peers: 'P', 'Direct Reports': 'DR', Others: 'O', Self: 'S' }

function countsLine(c: RaterCounts | null | undefined): string {
  if (!c) return '—'
  const parts = [
    `Manager ${c.manager ?? '—'}`,
    `Peers ${c.peers ?? '—'}`,
    `Direct Reports ${c.direct_reports ?? '—'}`,
    `Others ${c.others ?? '—'}`,
    `Self ${c.self ?? '—'}`,
  ]
  let s = parts.join(' · ')
  if (c.reported_as) {
    const r = c.reported_as
    const label: Record<string, string> = { manager: 'Manager', peers: 'Peers', direct_reports: 'Direct Reports', others: 'Others', self: 'Self' }
    s += `; reported as: ${Object.entries(r).map(([k, v]) => `${label[k] ?? k} ${v}`).join(' · ')}`
  }
  if (c.collapsed_note) s += `; note: ${c.collapsed_note}`
  return s
}

function bandNorms(band: Band | null, n75: number | null, n90: number | null): string {
  const b = band ?? 'band not printed'
  const norms = n75 != null || n90 != null ? ` (75th ${fmt(n75)}, 90th ${fmt(n90)})` : ''
  return `${b}${norms}`
}

/** "(4.67/4.50/3.50/4.67/4.00)" in M/P/DR/O/S order; "—" where a group did not rate. */
function groupScores(row: { manager: number | null; peers: number | null; direct_reports: number | null; others: number | null; self: number | null }): string {
  return `(${[row.manager, row.peers, row.direct_reports, row.others, row.self].map((v) => fmt(v)).join('/')})`
}

function itemSentence(text: string): string {
  const t = text.trim()
  return /[.?!)”"]$/.test(t) ? t : `${t}…`
}

export function renderAssessmentCompact(data: Assessment360Data): string {
  const out: string[] = []
  out.push(`PARTICIPANT: ${data.participant_name} · report dated ${data.report_date} · ${data.instrument} (${data.format_version})`)
  out.push(`RATER GROUPS (responses received): ${countsLine(data.rater_counts)}`)
  out.push('Reading key: every score is a perception on a 1–5 scale. 75th / 90th = the percentile marks the report prints on that row (norms). Group columns are M = Manager, P = Peers, DR = Direct Reports, O = Others, S = Self; "—" = that group is not reported on that row.')

  // Overall
  const o = data.overall_effectiveness
  if (o) {
    out.push(`OVERALL LEADERSHIP EFFECTIVENESS: total ${fmt(o.total)} — ${bandNorms(o.band, o.norm_75th, o.norm_90th)}`)
    const groups = [...o.by_rater_group].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
    out.push(`  by group: ${groups.map((g) => `${g.group} ${fmt(g.score)} (${g.vs_75th ?? '?'} the 75th ${fmt(g.norm_75th)}; ${g.vs_90th ?? '?'} the 90th ${fmt(g.norm_90th)})`).join(' · ')}`)
  } else {
    out.push('OVERALL LEADERSHIP EFFECTIVENESS: not read from this report')
  }

  // Engagement
  out.push(data.engagement.available ? `EMPLOYEE ENGAGEMENT (the six engagement items): ${fmt(data.engagement.total)} — ${data.engagement.band ?? 'band not printed'}` : `EMPLOYEE ENGAGEMENT: not reported in this report (${data.engagement.reason}) — absent, not low`)

  // Tent
  if (data.tent_poles.length) {
    out.push(`LEADERSHIP TENT (five poles): ${data.tent_poles.map((t) => `${t.name} ${fmt(t.score)} — ${bandNorms(t.band, t.norm_75th, t.norm_90th)}`).join(' · ')}`)
  }

  // Rankings joined with importance + gap rows
  const imp = new Map(data.importance.map((r) => [r.competency, r]))
  const gap = new Map(data.gap_analysis.map((r) => [r.competency, r]))
  const rankings = [...data.competency_rankings].sort((a, b) => a.rank - b.rank)
  out.push(
    "COMPETENCY RANKINGS in the report's order (by band, then by score within the band — a higher score can rank below a lower one in a higher band). Per row: total — band (75th, 90th; to-90th = the 90th mark minus the total, negative = already past it) · importance votes total (M/P/DR/O/S) · ● when the participant named it a passion · self rating and gap = total minus self, with whether the report marked (coloured) that gap:",
  )
  for (const r of rankings) {
    const i = imp.get(r.competency)
    const g = gap.get(r.competency)
    const votes = i ? `votes ${i.total_votes} (${i.manager}/${i.peers}/${i.direct_reports}/${i.others}/${i.self})${i.is_passion ? ' ●' : ''}` : 'votes —'
    const gapText = g
      ? `self ${fmt(g.self)} · gap ${signed(g.gap)} ${g.direction === 'positive' ? '(marked: others saw more than they did)' : g.direction === 'negative' ? '(marked: they rated themselves higher than others did)' : g.direction === 'irrelevant' ? '(not marked)' : '(unclassified)'}`
      : 'self —'
    const to90 = r.distance_to_90th == null ? '' : `; to-90th ${signed(r.distance_to_90th)}`
    out.push(`${r.rank}. ${r.competency} ${fmt(r.total)} — ${r.band} (75th ${fmt(r.norm_75th)}, 90th ${fmt(r.norm_90th)}${to90}) · ${votes} · ${gapText}`)
  }

  // Behaviors
  const beh = (title: string, rows: Assessment360Data['highest_behaviors']) => {
    if (!rows.length) return
    out.push(`${title} (item: total (M/P/DR/O/S) — competency):`)
    for (const b of rows) out.push(`- #${b.item_number ?? '?'} "${itemSentence(b.item)}" ${fmt(b.total)} ${groupScores(b)} — ${b.competency}`)
  }
  beh('HIGHEST-RATED BEHAVIORS', data.highest_behaviors)
  beh('LOWEST-RATED BEHAVIORS', data.lowest_behaviors)

  // Marked gaps
  const marked = data.gap_analysis.filter((g) => g.direction === 'positive' || g.direction === 'negative').sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  out.push(
    marked.length
      ? `SELF-VS-OTHERS GAPS THE REPORT MARKS (largest first): ${marked.map((g) => `${g.competency} — others ${fmt(g.total)}, self ${fmt(g.self)}, gap ${signed(g.gap)} (${g.direction === 'positive' ? 'others saw more' : 'self saw more'})`).join('; ')}. Unmarked gaps are on the ranking rows.`
      : 'SELF-VS-OTHERS GAPS: the report marks none — the self view and the others\' view sit close on every competency.',
  )

  // Three circles
  const cands = data.development_candidates
  const full = cands.filter((c) => c.circles_met === 3)
  const partial = cands.filter((c) => c.circles_met === 2)
  const describe = (c: Assessment360Data['development_candidates'][number]) =>
    `${c.competency} ${fmt(c.total)} — ${c.band}; ${fmt(c.distance_to_90th)} below its 90th mark; ${c.at_or_above_75th ? 'at/above the 75th' : c.distance_to_75th != null ? `${fmt(c.distance_to_75th)} below the 75th` : '75th unknown'}; votes ${c.total_votes} (manager ${c.manager_votes}); ${c.is_passion ? 'passion' : 'no passion'}${c.missing.length ? `; missing: ${c.missing.map((m) => (m === 'need' ? 'votes' : m)).join(', ')}` : ''}`
  out.push('WHERE THE THREE CIRCLES POINT (below its own 90th mark + voted important + a named passion), in the report-derived order — describe as potential, never prescribe:')
  if (full.length) out.push(`- All three: ${full.map(describe).join(' | ')}`)
  else out.push('- All three: none')
  if (partial.length) out.push(`- Two of three: ${partial.slice(0, 6).map(describe).join(' | ')}`)

  // The report's four-condition Fatal Flaw test (conditions 1–3 from the data)
  out.push(renderFatalFlawCheck(data))

  // Item details by competency
  if (data.competency_details.length) {
    out.push('BEHAVIOR ITEMS BY COMPETENCY (competency total, then each item: #number "text" total (M/P/DR/O/S)):')
    for (const d of data.competency_details) {
      const byGroup = new Map(d.by_rater_group.map((g) => [g.group, g.score]))
      const groupsText = GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => `${ABBR[g]} ${fmt(byGroup.get(g))}`).join(' ')
      out.push(`${d.competency} (${d.tent_pole}) ${fmt(d.total)}${groupsText ? ` [${groupsText}]` : ''}:`)
      for (const it of d.items) {
        const g = new Map(it.by_rater_group.map((x) => [x.group, x.score]))
        const scores = GROUP_ORDER.map((grp) => fmt(g.has(grp) ? g.get(grp) : null)).join('/')
        out.push(`  #${it.item_number} "${itemSentence(it.item)}" ${fmt(it.total)} (${scores})`)
      }
    }
  }

  // Reassessment (the follow-up report's own comparison)
  const ra = data.reassessment
  if (ra) {
    const win = (w: { from: string | null; to: string | null } | null) => (w ? `${w.from ?? '?'} → ${w.to ?? '?'}` : 'not printed')
    out.push("REASSESSMENT — this follow-up report's OWN comparison with the previous administration (only the previous totals it prints are known; no previous bands, norms, behaviors or comments):")
    out.push(`  rating windows: current ${win(ra.current_window)}; previous ${win(ra.previous_window)}`)
    out.push(`  previous raters: ${countsLine(ra.previous_rater_counts)}${ra.rater_sets_differ ? ' — the rater sets differ from this round (a comparability caveat)' : ''}`)
    if (ra.overall_previous) {
      out.push(`  previous overall: total ${fmt(ra.overall_previous.total)}${ra.overall_previous.by_rater_group.length ? ` (${ra.overall_previous.by_rater_group.map((g) => `${g.group} ${fmt(g.score)}`).join(' · ')})` : ''}`)
    }
    if (ra.engagement_previous_total != null) out.push(`  previous engagement: ${fmt(ra.engagement_previous_total)}`)
    if (ra.tent_poles_previous.length) out.push(`  previous tent: ${ra.tent_poles_previous.map((t) => `${t.name} ${fmt(t.score)}`).join(' · ')}`)
    const dir = (d: string | null) => (d === 'positive' ? 'meaningful improvement (coloured by the report)' : d === 'negative' ? 'meaningful decline (coloured by the report)' : d === 'irrelevant' ? 'not meaningful by the report\'s .30 rule' : 'uncoloured — not classified')
    out.push("  by competency, in the report's order (current / previous / gap = current minus previous):")
    for (const r of ra.by_competency) out.push(`  - ${r.competency}: ${fmt(r.current_total)} / ${fmt(r.previous_total)} / ${signed(r.gap)} — ${dir(r.direction)}`)
  }

  // Platform comparison
  const cmp = data.comparison
  if (cmp) {
    const c = cmp.comparability
    out.push(`COMPARISON — the platform's own comparison with the prior report on file (dated ${cmp.prior_assessment_date ?? 'unknown'}${cmp.months_elapsed != null ? `, ${cmp.months_elapsed} months earlier` : ''}; confidence ${c.confidence}; rater sets ${c.rater_sets_differ ? 'DIFFER' : 'match'}; norm vintage ${c.norm_vintage_differs ? 'DIFFERS' : 'same'}). Band movement and distance-to-90th first, raw deltas second; never total or rank the deltas:`)
    if (c.prior_rater_counts) out.push(`  prior raters: ${countsLine(c.prior_rater_counts)}`)
    for (const e of cmp.by_competency) {
      out.push(`  - ${e.competency}: ${fmt(e.prior_total)} (${e.prior_band}) → ${fmt(e.current_total)} (${e.current_band}); band ${e.band_moved}; raw ${signed(e.raw_delta)}; toward the 90th ${signed(e.normed_delta)}`)
    }
  }

  return out.join('\n')
}
