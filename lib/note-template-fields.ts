// Merge fields a coach can drop into a note template. The token text is what's
// stored in the template; when the template is inserted into a note it's
// resolved against the client's live data (see /api/clients/[id]/template-render).
export type TemplateField = { token: string; label: string; hint: string }

export const TEMPLATE_FIELDS: TemplateField[] = [
  { token: '{{client_name}}', label: 'Client name', hint: "the client's name" },
  { token: '{{today}}', label: "Today's date", hint: "today's date" },
  { token: '{{unfinished_actions}}', label: 'Unfinished actions', hint: 'open action items, most recent first' },
  { token: '{{recent_insights}}', label: 'Recent insights', hint: 'the last three captured insights' },
  { token: '{{coaching_goals}}', label: 'Coaching goals', hint: 'the engagement goal titles' },
]
