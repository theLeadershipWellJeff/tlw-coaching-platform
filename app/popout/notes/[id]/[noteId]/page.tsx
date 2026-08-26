import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'

// A single session note in a chromeless page, meant to be opened via
// window.open from the floating note window — a real OS-level browser window
// the coach can move anywhere on the desktop (next to Zoom, over other apps).
// Lives OUTSIDE the (authenticated) group so it renders without the app shell,
// but access is still the same tenant gate every note route runs through:
// requireClientCoach against the signed-in coach's session.

export const dynamic = 'force-dynamic'

// Static title only — the note's real title must not leak into metadata before
// the tenant gate has run.
export const metadata: Metadata = { title: 'Session note · theLeadershipWell' }

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function NotePopoutPage({
  params,
}: {
  params: { id: string; noteId: string }
}) {
  let note: { title: string | null; session_date: string; content: string } | null = null
  let denied = false

  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)
    const { data } = await supabase
      .from('notes')
      .select('title, session_date, content')
      .eq('id', params.noteId)
      .eq('client_id', params.id)
      .maybeSingle()
    note = data
  } catch {
    denied = true
  }

  if (denied || !note) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-[14px] text-tlw-espresso">
          {denied
            ? 'Please sign in to the coaching platform in this browser, then reopen this note.'
            : 'This note could not be found.'}
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-tlw-surface">
      <header className="sticky top-0 border-b border-tlw-warm-gray/15 bg-tlw-canvas/95 px-5 py-3 backdrop-blur">
        <h1 className="truncate text-[15px] font-medium text-tlw-navy-deep">
          {note.title?.trim() || 'Untitled note'}
        </h1>
        <p className="text-[12px] text-tlw-warm-gray">{formatDate(note.session_date)}</p>
      </header>
      <div className="px-5 py-4">
        {note.content?.trim() ? (
          <div
            className="tlw-prose text-[14px] leading-relaxed text-tlw-espresso"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">This note is empty.</p>
        )}
      </div>
    </main>
  )
}
