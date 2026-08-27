'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Note } from '@/lib/supabase/types'

// A past session note in a floating, draggable, resizable window — so the coach
// can read an old note alongside the note they're writing (and their Zoom
// window). Portaled to document.body so no card/rail stacking context can trap
// it. The ⧉ button re-opens the note in a real browser popup window that can be
// moved anywhere on the desktop, outside the app window entirely.

const DEFAULT_W = 440
const DEFAULT_H = 460

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
  // Position stagger at open time, so several windows don't hide each other.
  stackIndex: number
  zIndex: number
  onFocus: () => void
  onEdit: () => void
  onClose: () => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  // Position on mount only (client-side — also gates the portal off SSR).
  // Starts near the top-right, staggered down-left per already-open window.
  useEffect(() => {
    setPos({
      x: Math.max(16, window.innerWidth - DEFAULT_W - 48 - stackIndex * 28),
      y: 96 + stackIndex * 28,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!pos) return null

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    // Header buttons shouldn't start a drag.
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - pos!.x, dy: e.clientY - pos!.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    // Keep enough of the header on screen to grab it back.
    const x = Math.min(Math.max(e.clientX - drag.current.dx, 64 - DEFAULT_W), window.innerWidth - 64)
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - 40)
    setPos({ x, y })
  }

  function endDrag() {
    drag.current = null
  }

  // A real OS-level window — movable anywhere on the desktop, next to Zoom.
  function popOut() {
    window.open(
      `/popout/notes/${clientId}/${note.id}`,
      `tlw-note-${note.id}`,
      `width=${DEFAULT_W + 80},height=640,left=120,top=120`
    )
    onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-label={note.title || 'Session note'}
      onPointerDown={onFocus}
      className="fixed flex flex-col rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: DEFAULT_W,
        height: DEFAULT_H,
        minWidth: 300,
        minHeight: 220,
        maxWidth: '92vw',
        maxHeight: '88vh',
        resize: 'both',
        overflow: 'hidden',
        zIndex,
      }}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="flex cursor-grab touch-none items-center gap-2 border-b border-tlw-warm-gray/15 bg-tlw-canvas/60 px-3 py-2 active:cursor-grabbing"
      >
        <div className="min-w-0 flex-1 select-none">
          <p className="truncate text-[13px] font-medium leading-tight text-tlw-navy-deep">
            {note.title?.trim() || 'Untitled note'}
          </p>
          <p className="text-[11px] leading-tight text-tlw-warm-gray">{formatDate(note.session_date)}</p>
        </div>
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
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close note window"
          className="shrink-0 rounded-tlw-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:text-tlw-signal-orange"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {note.content?.trim() ? (
          <div
            className="tlw-prose text-[14px] leading-relaxed text-tlw-espresso"
            dangerouslySetInnerHTML={{ __html: note.content }}
          />
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">This note is empty.</p>
        )}
      </div>
    </div>,
    document.body
  )
}
