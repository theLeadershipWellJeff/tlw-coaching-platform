'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Generic draggable, resizable floating window, portaled to document.body so no
// card/rail stacking context can trap it. Shared chrome for the floating note
// windows and the plan-session window: drag by the header, resize from the
// bottom-right corner, custom header actions, click brings to front (onFocus).

export function FloatingWindow({
  title,
  subtitle,
  headerActions,
  children,
  stackIndex,
  zIndex,
  width = 440,
  height = 460,
  onFocus,
  onClose,
  ariaLabel,
}: {
  title: string
  subtitle?: string
  // Extra header buttons, rendered between the title and the close button.
  headerActions?: React.ReactNode
  children: React.ReactNode
  // Position stagger at open time, so several windows don't hide each other.
  stackIndex: number
  zIndex: number
  width?: number
  height?: number
  onFocus: () => void
  onClose: () => void
  ariaLabel?: string
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  // Position on mount only (client-side — also gates the portal off SSR).
  // Starts near the top-right, staggered down-left per already-open window.
  useEffect(() => {
    setPos({
      x: Math.max(16, window.innerWidth - width - 48 - stackIndex * 28),
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
    const x = Math.min(Math.max(e.clientX - drag.current.dx, 64 - width), window.innerWidth - 64)
    const y = Math.min(Math.max(e.clientY - drag.current.dy, 0), window.innerHeight - 40)
    setPos({ x, y })
  }

  function endDrag() {
    drag.current = null
  }

  return createPortal(
    <div
      role="dialog"
      aria-label={ariaLabel || title}
      onPointerDown={onFocus}
      className="fixed flex flex-col rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width,
        height,
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
          <p className="truncate text-[13px] font-medium leading-tight text-tlw-navy-deep">{title}</p>
          {subtitle && <p className="text-[11px] leading-tight text-tlw-warm-gray">{subtitle}</p>}
        </div>
        {headerActions}
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close window"
          className="shrink-0 rounded-tlw-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:text-tlw-signal-orange"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>,
    document.body
  )
}
