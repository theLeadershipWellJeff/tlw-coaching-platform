/**
 * Standard templates — theLeadershipWell's shared session-notes layouts and the
 * library of great questions, available to EVERY coach without any per-coach
 * seeding. They are code-defined (not `note_templates` rows), so they can't be
 * edited or deleted from the Library; a coach copies one into their own
 * templates (POST /api/templates) to make it theirs. They surface in two places:
 * the Library → Templates "theLeadershipWell standards" folder (read-only, with
 * "Copy to my templates") and the note editor's Templates menu.
 *
 * Content is rich-text HTML in the note editor's vocabulary (h2/h3/p/ul/ol) and
 * may carry merge fields (lib/note-template-fields.ts), which resolve against
 * the client when inserted. Keep this dependency-free — the editor imports it
 * client-side.
 */
export type StandardTemplate = {
  /** Stable key — used as the id (`std:<key>`) in the editor and Library. */
  key: string
  name: string
  /** One line shown in the Library list. */
  description: string
  content: string
}

/** The id the UI uses for a standard template (never a database uuid). */
export const STANDARD_TEMPLATE_ID_PREFIX = 'std:'
/** The virtual Library folder id that lists the standards. */
export const STANDARD_FOLDER_ID = 'standard'
export const STANDARD_FOLDER_LABEL = 'theLeadershipWell standards'

export function standardTemplateId(key: string): string {
  return `${STANDARD_TEMPLATE_ID_PREFIX}${key}`
}

export function isStandardTemplateId(id: string): boolean {
  return id.startsWith(STANDARD_TEMPLATE_ID_PREFIX)
}

const SESSION_NOTES = `<h2>Session notes · {{client_name}} · {{today}}</h2>
<h3>Check-in</h3>
<p>How are they arriving — energy, mood, what has happened since last time?</p>
<h3>Open actions from last session</h3>
<p>{{unfinished_actions}}</p>
<h3>Focus for today</h3>
<p>What does the client want to leave with? (Their words, not yours.)</p>
<h3>Engagement goals</h3>
<p>{{coaching_goals}}</p>
<h3>What we explored</h3>
<ul><li></li></ul>
<h3>What shifted</h3>
<p>The moment the client saw something differently — name it.</p>
<p>INSIGHT: </p>
<h3>Commitments</h3>
<p>One line per action, in the client's words. Each ACTION: line becomes a checkbox the client can tick from the recap email.</p>
<p>ACTION: </p>
<h3>Close</h3>
<p>What was most useful today? What are they taking with them?</p>
<h3>For next session</h3>
<p>NEXT TIME: </p>`

const GREAT_QUESTIONS = `<h2>Library of great questions</h2>
<p>Coaching questions that open thinking rather than close it. Short, open, one at a time — then silence. Pick two or three for the session; do not read the list.</p>
<h3>Opening the session</h3>
<ul>
<li>What's on your mind?</li>
<li>What would make this hour worth your time?</li>
<li>What has happened since we last spoke that still has your attention?</li>
<li>Of everything on your plate, what matters most right now?</li>
<li>What do you want to be different by the end of our conversation?</li>
</ul>
<h3>Clarifying the real challenge</h3>
<ul>
<li>What's the real challenge here for you?</li>
<li>And what else?</li>
<li>If you had to choose one thing to work on, what would it be?</li>
<li>What is this really about?</li>
<li>What's the question you have been avoiding?</li>
</ul>
<h3>Exploring feelings and meaning</h3>
<ul>
<li>What are you feeling as you say that?</li>
<li>Where do you notice that in your body?</li>
<li>What does that feeling want you to know?</li>
<li>What is at stake for you here?</li>
<li>What would you be giving up if this changed?</li>
</ul>
<h3>Shifting perspective</h3>
<ul>
<li>What would you tell a friend in this exact situation?</li>
<li>How would your future self, five years on, see this?</li>
<li>What assumption are you making that might not be true?</li>
<li>What is the most generous interpretation of what happened?</li>
<li>If this were easy, what would you do?</li>
<li>What would you do if you knew you could not fail?</li>
</ul>
<h3>Identity and values</h3>
<ul>
<li>Who are you becoming through this?</li>
<li>What does this say about what you value?</li>
<li>When have you handled something like this well before? What did you draw on?</li>
<li>What kind of leader do you want to be remembered as in this moment?</li>
</ul>
<h3>Options and possibility</h3>
<ul>
<li>What could you do? (Keep asking until the list is long.)</li>
<li>What would you try if resources were not a constraint?</li>
<li>Which of these options excites you most, and why?</li>
<li>What is the smallest step that would prove you are moving?</li>
</ul>
<h3>Commitment and accountability</h3>
<ul>
<li>What will you do, by when?</li>
<li>On a scale of one to ten, how committed are you? What would make it a nine?</li>
<li>If you are saying yes to this, what are you saying no to?</li>
<li>What might get in the way, and how will you handle it?</li>
<li>How will you know it worked?</li>
<li>Who needs to know about this decision?</li>
</ul>
<h3>Closing the session</h3>
<ul>
<li>What was most useful for you today?</li>
<li>What are you taking with you?</li>
<li>What did you learn about yourself in this conversation?</li>
<li>What should we pick up next time?</li>
</ul>
<h3>Where these come from</h3>
<p>Drawn from the ICF Core Competencies (Evokes Awareness, Facilitates Client Growth), Sir John Whitmore's GROW model (Coaching for Performance), Michael Bungay Stanier's seven questions (The Coaching Habit), and Co-Active Coaching (Kimsey-House et al.). The remainder are theLeadershipWell practice questions — no research claim attached.</p>`

const FIRST_SESSION = `<h2>First session · {{client_name}} · {{today}}</h2>
<p>The contracting session. Set the engagement up so the client co-authors it — what coaching is and is not, how we work, and what they want from it. Tick each item as you cover it; note the client's words where you can.</p>
<h3>Agreement-setting</h3>
<ul>
<li>What coaching is / is not (not consulting, not therapy) — client's understanding:</li>
<li>Roles: what they can expect from me, what I expect of them:</li>
<li>Confidentiality and its limits:</li>
<li>Recording: verbal consent to record sessions given? (yes / no / declined)</li>
<li>Cadence, length of engagement, how we handle reschedules:</li>
<li>Fees and billing, if not already settled:</li>
<li>Compatibility check — how does this feel so far? Anything that would make it a better fit?</li>
</ul>
<h3>Their story, in brief</h3>
<p>Role, context, what brought them to coaching now.</p>
<h3>What they want from the engagement</h3>
<p>Draft goals in the client's words — refine them into engagement goals after the session.</p>
<ul><li></li></ul>
<h3>How they will know it worked</h3>
<p>What would be different in ninety days? What would others notice?</p>
<h3>Insights</h3>
<p>INSIGHT: </p>
<h3>Commitments before next session</h3>
<p>ACTION: </p>
<h3>For next session</h3>
<p>NEXT TIME: </p>`

const ENGAGEMENT_REVIEW = `<h2>Engagement review · {{client_name}} · {{today}}</h2>
<p>A step back from the week-to-week to look at the whole engagement. Best done at the mid-point and again near the close.</p>
<h3>Engagement goals</h3>
<p>{{coaching_goals}}</p>
<h3>Progress on each goal</h3>
<p>Client's own rating, and the evidence behind it. What has actually changed — in behaviour, in results, in how others respond?</p>
<ul><li></li></ul>
<h3>Recent insights</h3>
<p>{{recent_insights}}</p>
<h3>What is working in how we work</h3>
<p>Ask directly: what is most useful about our sessions? What would you like more of, or less of?</p>
<h3>Goals to keep, change, or add</h3>
<p>Update the engagement goals after the session so the next session prep reflects them.</p>
<h3>Insights</h3>
<p>INSIGHT: </p>
<h3>Commitments</h3>
<p>ACTION: </p>
<h3>For next session</h3>
<p>NEXT TIME: </p>`

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: 'session-notes',
    name: 'Session notes',
    description:
      'The standard session-notes layout — check-in, open actions, focus, what shifted, commitments, next time. Merge fields fill in from the client.',
    content: SESSION_NOTES,
  },
  {
    key: 'great-questions',
    name: 'Library of great questions',
    description:
      'Powerful coaching questions by moment in the session — opening, clarifying, feelings, perspective, options, commitment, close.',
    content: GREAT_QUESTIONS,
  },
  {
    key: 'first-session',
    name: 'First session (contracting)',
    description:
      'The agreement-setting checklist for session one — what coaching is, roles, confidentiality, recording consent, cadence, fees, fit.',
    content: FIRST_SESSION,
  },
  {
    key: 'engagement-review',
    name: 'Engagement review',
    description:
      'A mid-point or closing review of the whole engagement — progress on each goal, what is working, goals to keep, change, or add.',
    content: ENGAGEMENT_REVIEW,
  },
]

export function findStandardTemplate(key: string): StandardTemplate | undefined {
  return STANDARD_TEMPLATES.find((t) => t.key === key)
}

/**
 * The standards in the same shape as a `note_templates` row, so list UIs can
 * render them alongside a coach's own templates. `id` = `std:<key>`,
 * `coach_id`/`folder_id` = null, and `standard: true` marks them read-only.
 */
export function standardTemplatesAsRows() {
  const stamp = '2026-09-08T00:00:00.000Z'
  return STANDARD_TEMPLATES.map((t) => ({
    id: standardTemplateId(t.key),
    coach_id: null as string | null,
    folder_id: null as string | null,
    name: t.name,
    description: t.description,
    content: t.content,
    standard: true as const,
    created_at: stamp,
    updated_at: stamp,
  }))
}
