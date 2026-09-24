/**
 * Zenger Folkman's Strength Builder Development Guide — the "build around, not
 * on" companion behaviors for each of the 19 differentiating competencies —
 * transcribed from the participant report (pages 41–112) into
 * `strength-builders.json` so the assistant carries it as data, not a PDF.
 *
 * Vendor material (© 2024 Zenger Folkman, EL60.1D.4), licensed to
 * theLeadershipWell for its participants; the assistant cites it as Zenger
 * Folkman's. Two shapes leave this module:
 *
 *   - `strengthBuilderIndexText()` — the whole map in ~19 lines (competency →
 *     builder names). Cross-client, so it sits in the cached system prefix.
 *   - `renderStrengthBuilders(competencies)` — the full guide entry (rationale
 *     + development ideas + linear suggestions) for the few competencies the
 *     report points at for THIS client. Per-client, so it sits in the snapshot.
 *
 * The human-readable copy is `rubrics/05_zf360_strength_builders_reference.md`,
 * rendered from the same JSON by `scripts/rubrics/render-strength-builders.js`.
 */
import guide from './strength-builders.json'

export type StrengthBuilder = {
  name: string
  rationale: string
  ideas: string[]
}

export type StrengthBuilderEntry = {
  competency: string
  tent_pole: string
  definition: string
  strength_builders: StrengthBuilder[]
  linear_development_suggestions: string[]
}

export type StrengthBuilderGuide = {
  source: string
  transcription_note: string
  intro: string[]
  how_to_use: string[]
  competencies: StrengthBuilderEntry[]
}

export const STRENGTH_BUILDER_GUIDE: StrengthBuilderGuide = guide as StrengthBuilderGuide

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const BY_NAME = new Map<string, StrengthBuilderEntry>()
for (const c of STRENGTH_BUILDER_GUIDE.competencies) {
  BY_NAME.set(norm(c.competency), c)
}
// The report sometimes prints the long name short (page headers), and the
// importance page prints it long; accept both.
BY_NAME.set(norm('Inspires and Motivates Others'), BY_NAME.get(norm('Inspires and Motivates Others to High Performance'))!)

/** The guide entry for a competency, matched case- and punctuation-insensitively. */
export function strengthBuildersFor(competency: string): StrengthBuilderEntry | null {
  return BY_NAME.get(norm(competency)) ?? null
}

/** Competency definitions, one line each (the report's own wording). */
export function competencyDefinitionsText(): string {
  return STRENGTH_BUILDER_GUIDE.competencies.map((c) => `- ${c.competency} (${c.tent_pole}): ${c.definition}`).join('\n')
}

/**
 * The cross-client index: what Strength Builders are, how the guide is used,
 * and every competency's builders by name. ~600 tokens; cached with the prefix.
 */
export function strengthBuilderIndexText(): string {
  const g = STRENGTH_BUILDER_GUIDE
  const lines: string[] = []
  lines.push(
    "STRENGTH BUILDERS (Zenger Folkman's Strength Builder Development Guide — the second half of every participant report). Zenger Folkman found that leaders highly effective in a competency were also highly skilled at a handful of statistically linked companion behaviors, and leaders ineffective in it were ineffective at the same ones. Their conclusion: the most effective way to build a strength is often not to build on it but to build AROUND it — cross-training, the way a swimmer runs and lifts. Each competency's companions are its Strength Builders; each builder has a one-paragraph rationale and three research-backed development ideas, and each competency also has a list of linear (direct) development suggestions.",
  )
  lines.push(`How the guide is used (the report's own steps): ${g.how_to_use.map((s, i) => `${i + 1}) ${s}`).join(' ')}`)
  lines.push(
    'Use it this way: once a participant is leaning toward a development target, name that competency\'s Strength Builders and ask which one they have real interest and passion for; then offer that builder\'s development ideas as raw material for a goal THEY write — adapt, never assign. Cite it as Zenger Folkman\'s guide. The full entries for the competencies this participant\'s report points at are in their own section below; for any other competency you have only the names here.',
  )
  lines.push('Competency → its Strength Builders (tent pole in brackets):')
  for (const c of g.competencies) {
    lines.push(`- ${c.competency} [${c.tent_pole}]: ${c.strength_builders.map((b) => b.name).join(' · ')}`)
  }
  return lines.join('\n')
}

export type RenderStrengthBuildersOptions = {
  /** Include the linear development suggestions (default true). */
  linear?: boolean
  /** Include each builder's development ideas (default true). */
  ideas?: boolean
}

/**
 * The full guide entry for the given competencies (unknown names are skipped),
 * in the order given. Each entry runs ~1,100–1,500 tokens with everything on.
 */
export function renderStrengthBuilders(competencies: string[], opts: RenderStrengthBuildersOptions = {}): string {
  const linear = opts.linear !== false
  const ideas = opts.ideas !== false
  const parts: string[] = []
  const seen = new Set<string>()
  for (const name of competencies) {
    const e = strengthBuildersFor(name)
    if (!e || seen.has(e.competency)) continue
    seen.add(e.competency)
    const lines: string[] = []
    lines.push(`## ${e.competency} (${e.tent_pole})`)
    lines.push(`Definition: ${e.definition}`)
    lines.push(`Strength Builders (build around it): ${e.strength_builders.map((b) => b.name).join(' · ')}`)
    for (const b of e.strength_builders) {
      lines.push(`- ${b.name} — ${b.rationale}`)
      if (ideas) for (const idea of b.ideas) lines.push(`    · ${idea}`)
    }
    if (linear && e.linear_development_suggestions.length) {
      lines.push(`Linear development suggestions (working directly on the competency): ${e.linear_development_suggestions.map((s) => `• ${s}`).join(' ')}`)
    }
    parts.push(lines.join('\n'))
  }
  return parts.join('\n\n')
}

/** The builder NAMES for a competency, or an empty list when it is not in the guide. */
export function strengthBuilderNames(competency: string): string[] {
  return strengthBuildersFor(competency)?.strength_builders.map((b) => b.name) ?? []
}
