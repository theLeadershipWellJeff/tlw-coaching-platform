/**
 * Workspace guides — the short "how to use this space" note shown under each
 * workspace title. Copy lives here (dependency-free) so every page renders the
 * same voice; the banner itself is app/components/layout/WorkspaceGuide.tsx,
 * dismissable per workspace (localStorage, key `tlw-guide-dismissed:<id>`).
 * Account → Profile has a "show the workspace guides again" reset.
 */
export type WorkspaceGuideKey =
  | 'dashboard'
  | 'clients'
  | 'client'
  | 'notes'
  | 'transcripts'
  | 'practice'
  | 'library'
  | 'nudges'
  | 'business-center'
  | 'command-center'
  | 'account'

export const WORKSPACE_GUIDES: Record<WorkspaceGuideKey, string> = {
  dashboard:
    'This is where you can see the big picture. Cards here in this workspace will show you the things that matter to you at a glance. You can add, remove, or arrange the cards to fit your needs.',
  clients:
    'Everyone you coach lives here. Add a client to open their workspace, keep the roster current with the Active / Inactive / Archived toggle, and reach a whole list at once with Email all.',
  client:
    'Everything about one client in one place. Write session notes, plan and send session prep, book the next session, issue the coaching agreement, and keep goals and actions current. Add, remove, or arrange the cards to fit how you coach.',
  notes:
    'Write your session notes here. Start a line with ACTION: or INSIGHT: and it is captured on the right — actions become a checklist you can send to the client, and NEXT TIME: flags carry into your next session plan. Key info, the coaching map, and engagement goals stay beside you while you write. The Templates menu holds the standard session-notes layout and the library of great questions.',
  transcripts:
    'Every recorded session for this client. Import a transcript file, score it against the rubric, or file it without a score. Scored sessions appear on your Practice scorecard.',
  practice:
    'How are you doing as a coach? This space uses proprietary scoring rubric to rate your coaching sessions and provide suggestions to improve your coaching. You can also set your own goals and rubric to get the input that matters to you.',
  library:
    'Your reusable materials in one place: session-notes templates, the library of great questions, PDF resources you send to clients, and the master coaching agreement. Templates appear in the note editor’s Templates menu, and the standard theLeadershipWell templates are always there to copy and make your own.',
  nudges:
    'Between-session touches, drafted from your sessions in your voice. Review, edit, schedule, or skip each one — nothing is sent without you.',
  'business-center':
    'The money side of your practice. Billing accounts, engagements, invoices, and the billing run live here, alongside revenue and your coaching hours.',
  'command-center':
    'The supervisor’s view over every coach on the platform: account state, usage, plans, portal adoption, and coach billing.',
  account:
    'Make the app yours. Set how it refers to you, your timezone and calendar, availability and reminders, email signature, transcript source, and vault connection.',
}

export const GUIDE_STORAGE_PREFIX = 'tlw-guide-dismissed:'

export function guideStorageKey(id: WorkspaceGuideKey): string {
  return `${GUIDE_STORAGE_PREFIX}${id}`
}
