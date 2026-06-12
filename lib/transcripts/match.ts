/**
 * Fuzzy-match a transcript's raw client name against the canonical roster.
 *
 * Fail-loud principle (spec §19): we return a confidence and only call it a
 * confident match above a threshold. Anything short of that is flagged for
 * manual confirmation rather than guessed — those flags teach the roster over
 * time. We match on full name, first+last tokens, and initials so the matcher
 * still works when the file carries only "M.W."
 */

export interface RosterClient {
  id: string
  name: string
}

export interface MatchResult {
  clientId: string | null
  confidence: number // 0..1
  status: 'matched' | 'needs_review' | 'unmatched'
}

const CONFIDENT = 0.85

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean)
}

function initialsOf(name: string): string {
  return tokens(name)
    .map((t) => t[0])
    .join('')
}

/** Looks like an initials-only label, e.g. "M.W." or "mw". */
function isInitialsOnly(raw: string): boolean {
  const compact = raw.replace(/[^A-Za-z]/g, '')
  return compact.length > 0 && compact.length <= 3 && !/\s/.test(raw.trim().replace(/\./g, ''))
}

/** Jaccard overlap of token sets — order-independent, tolerant of extra words. */
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  ta.forEach((t) => {
    if (tb.has(t)) inter++
  })
  // Jaccard: |A ∩ B| / |A ∪ B|, where |A ∪ B| = |A| + |B| − |A ∩ B|.
  return inter / (ta.size + tb.size - inter)
}

/** Score one roster candidate against the raw name, 0..1. */
function scoreCandidate(raw: string, candidate: string): number {
  const nr = normalize(raw)
  const nc = normalize(candidate)
  if (!nr || !nc) return 0
  if (nr === nc) return 1

  // Initials-only input: compare against the candidate's initials.
  if (isInitialsOnly(raw)) {
    const ri = raw.replace(/[^A-Za-z]/g, '').toLowerCase()
    const ci = initialsOf(candidate)
    if (ri === ci) return 0.9 // strong but not certain — initials collide
    if (ci.startsWith(ri) || ri.startsWith(ci)) return 0.6
    return 0
  }

  const overlap = tokenOverlap(raw, candidate)
  // First + last name both present is a strong signal even amid extra tokens.
  // Allow a single-letter token to match the other token's initial, so the
  // common transcript form "Michel W." matches the roster's "Michel Wertheim".
  const rt = tokens(raw)
  const ct = tokens(candidate)
  const initialEq = (a: string, b: string) =>
    a === b || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))
  const firstLastHit =
    rt.length >= 2 &&
    ct.length >= 2 &&
    initialEq(rt[0], ct[0]) &&
    initialEq(rt[rt.length - 1], ct[ct.length - 1])
  if (firstLastHit) return Math.max(overlap, 0.9)

  // One distinctive token in common (e.g. an unusual surname).
  if (overlap > 0) return overlap
  return 0
}

export function matchClient(rawName: string | null, roster: RosterClient[]): MatchResult {
  if (!rawName || roster.length === 0) {
    return { clientId: null, confidence: 0, status: rawName ? 'needs_review' : 'unmatched' }
  }

  let best: { client: RosterClient; score: number } | null = null
  let runnerUp = 0
  for (const c of roster) {
    const s = scoreCandidate(rawName, c.name)
    if (!best || s > best.score) {
      runnerUp = best ? best.score : 0
      best = { client: c, score: s }
    } else if (s > runnerUp) {
      runnerUp = s
    }
  }

  if (!best || best.score === 0) {
    return { clientId: null, confidence: 0, status: 'needs_review' }
  }

  // Ambiguous when the top two candidates are close — fail loud rather than
  // pick one (spec §19).
  const ambiguous = best.score - runnerUp < 0.15 && runnerUp > 0
  const confident = best.score >= CONFIDENT && !ambiguous

  return {
    clientId: confident ? best.client.id : null,
    confidence: best.score,
    status: confident ? 'matched' : 'needs_review',
  }
}
