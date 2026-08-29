'use client'
import type { Note } from '@/lib/supabase/types'
import { FloatingWindow } from '@/app/components/shared/FloatingWindow'

// A past session note in a floating, draggable, resizable window — so the coach
// can read an old note alongside the note they're writing (and their Zoom
// window). The ⧉ button re-opens the note in a real browser popup window that
// can be moved anywhere on the desktop, outside the app window entirely.

const DEFAULT_W = 440

// Open a note as a real OS-level browser popup — movable anywhere on the
// desktop, next to Zoom. Named per note so re-opening refocuses the existing
// window instead of stacking duplicates. Shared with the notes list's ⧉
// button, which pops a note out directly without the floating window first.
export function openNotePopout(clientId: string, noteId: string) {
  window.open(
    `/popout/notes/${clientId}/${noteId}`,
    `tlw-note-${noteId}`,
    `width=${DEFAULT_W + 80},height=640,left=120,top=120`
  )
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function FloatingNoteWindow({
  note,
  clientId,
  stackIndex,
  zIndex,
  onFocus,
  onEdit,
  onClose,
}: {
  note: Note
  clientId: string
  stackIndex: number
  zIndex: number
  onFocus: () => void
  onEdit: () => void
  onClose: () => void
}) {
  // A real OS-level window — movable anywhere on the desktop, next to Zoom.
  function popOut() {
    openNotePopout(clientId, note.id)
    onClose()
  }

  return (
    <FloatingWindow
      title={note.title?.trim() || 'Untitled note'}
      subtitle={formatDate(note.session_date)}
      stackIndex={stackIndex}
      zIndex={zIndex}
      width={DEFAULT_W}
      onFocus={onFocus}
      onClose={onClose}
      headerActions={
        <>
          <button
            onClick={onEdit}
            title="Open this note in the editor"
            className="shrink-0 rounded-tlw-md border border-tlw-warm-gray/25 px-2 py-0.5 text-[11px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
          >
            Edit
          </button>
          <button
            onClick={popOut}
            title="Pop out to its own window (move it anywhere on your desktop)"
            aria-label="Pop out to a separate window"
            className="shrink-0 rounded-tlw-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
          >
            ⧉
          </button>
        </>
      }
    >
      <div className="px-4 py-3">
        {note.content?.trim() ? (
          <div
            className="tlw-prose text-[14px] leading-relaxed text-tlw-espresso"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">This note is empty.</p>
        )}
      </div>
    </FloatingWindow>
  )
}
