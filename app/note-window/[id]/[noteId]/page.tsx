import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { ApiError } from '@/lib/api-handler'

/**
 * Read-only note viewer for a separate, movable browser window.
 *
 * Opened from the session-notes panel's "Last session notes" list via
 * window.open(), so the coach can drag a previous session's note anywhere on
 * screen and read it alongside the note they're currently writing. Lives
 * OUTSIDE the (authenticated) route group on purpose — the AppShell
 * (sidebar/header) would swamp a small popup — but auth is identical to every
 * coach route: NextAuth session (same-origin popup shares the cookie) +
 * requireClientCoach tenant gating. Not signed in → the sign-in landing;
 * not this coach's client (or no such note) → 404.
 */

export const dynamic = 'force-dynamic'

// cache() dedupes the load between generateMetadata and the page render.
const loadNote = cache(async (clientId: string, noteId: string) => {
  const supabase = getSupabaseAdmin()
  await requireClientCoach(supabase, clientId)

  const [{ data: note }, { data: client }] = await Promise.all([
    supabase
      .from('notes')
      .select('id, title, content, session_date, duration_minutes')
      .eq('id', noteId)
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase.from('clients').select('name').eq('id', clientId).maybeSingle(),
  ])
  if (!note) throw new ApiError(404, 'Note not found')
  return { note, clientName: client?.name || '' }
})

function formatDate(d: string): string {
  // d is YYYY-MM-DD; parse the parts so the label never drifts a day on TZ.
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export async function generateMetadata({
  params,
}: {
  params: { id: string; noteId: string }
}): Promise<Metadata> {
  // Window/tab title = the note title, so several open note windows stay
  // tellable apart. Any failure (signed out, wrong coach) falls back to a
  // generic title; the page render below handles the actual redirect/404.
  try {
    const { note, clientName } = await loadNote(params.id, params.noteId)
    return { title: note.title?.trim() || `${clientName} · Session note` }
  } catch {
    return { title: 'Session note' }
  }
}

export default async function NoteWindowPage({
  params,
}: {
  params: { id: string; noteId: string }
}) {
  let data: Awaited<ReturnType<typeof loadNote>> | null = null
  let signedOut = false
  try {
    data = await loadNote(params.id, params.noteId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) signedOut = true
  }
  if (signedOut) redirect('/')
  if (!data) notFound()

  const { note, clientName } = data

  return (
    <main className="mx-auto min-h-screen max-w-3xl p-4 sm:p-6">
      <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
        <div className="border-b border-tlw-warm-gray/15 px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Session note · read-only
          </p>
          <h1 className="mt-1 text-lg font-medium text-tlw-navy-deep">
            {note.title?.trim() || 'Untitled note'}
          </h1>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
            {clientName && <span>{clientName} · </span>}
            {formatDate(note.session_date)}
            {note.duration_minutes ? ` · ${note.duration_minutes} min` : ''}
          </p>
        </div>
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
      </div>
      <p className="mt-3 text-center text-[11px] text-tlw-warm-gray/80">
        Drag this window anywhere to read it beside the note you&apos;re writing.
        Edits happen in the main workspace.
      </p>
    </main>
  )
}
