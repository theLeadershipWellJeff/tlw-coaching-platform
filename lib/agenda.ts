// The prompts a client answers from the prep email to shape the session agenda.
// Stored answers are kept as [{ q, a }] so they stay readable even if the
// prompts change later.
export const AGENDA_PROMPTS = [
  'What is most on your mind for our session?',
  'What would make this session a win for you?',
  'Anything else you want on the agenda?',
]

export type AgendaItem = { q: string; a: string }
