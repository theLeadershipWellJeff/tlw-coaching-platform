/**
 * The verbatim goal reference block for a goals nudge — the selected goal(s)
 * bulleted, with metrics beneath when set. Appended DETERMINISTICALLY to the
 * email body (never left to the model, so the list is always exact):
 * - draftNudge appends it to every AI-drafted goals nudge;
 * - CreateNudgeModal inserts it into the body when the coach picks a goal.
 *
 * Plain text, single newlines: lib/nudges/email.ts#nudgeBodyToHtml turns the
 * whole block into one paragraph with <br/> line breaks. Metric lines are
 * indented with em-spaces (U+2003) because ordinary leading spaces collapse
 * when the email renders as HTML.
 */

export type GoalForList = { title: string; description?: string; metrics?: string[] }

export function formatGoalListForEmail(goals: GoalForList[]): string {
  const lines: string[] = ['For quick reference:']
  for (const g of goals) {
    lines.push(`• ${g.title}`)
    for (const m of g.metrics || []) {
      if (m && m.trim()) lines.push(`  – ${m.trim()}`)
    }
  }
  return lines.join('\n')
}
