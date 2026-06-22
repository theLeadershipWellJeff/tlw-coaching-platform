'use client'
/**
 * DashboardSurface — the run-time arrangement layer for the coach's dashboard.
 *
 * Loads the coach's stored layout, renders the placed cards into a grid, and
 * lets the coach add, remove, resize, and (in Arrange mode) drag to reorder
 * cards. Reordering is iOS-style: as a dragged card moves over a slot the other
 * cards live-reflow out of the way (a FLIP slide), and the dragged card drops
 * into the opened space — it never replaces/swaps the card under it. Every
 * mutation persists to `/api/dashboard/layout` (last-write-wins).
 *
 * Each placed card is hosted once (CardHost), so its data hook runs a single
 * time per instance — resizing changes the `size` prop without remounting, and
 * therefore never refetches (brief §3.2 / §5).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { availableToAdd } from '@/lib/dashboard/cards'
import type { CardMeta, CardPlacement, CardSize, DashboardCard } from '@/lib/dashboard/types'
import { DASHBOARD_CARDS, getDashboardCard } from './registry'
import { CardFrame } from './CardFrame'

// Run layout effects on the client only (avoids the SSR useLayoutEffect warning).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// compact = 1 col · standard = 2 col · expanded = full row, on a 4-col desktop
// grid. Literal classes so Tailwind keeps them. A card may pin its width via
// CardMeta.fixedSpan (list cards that change height, not width, across sizes).
const SPAN: Record<CardSize, string> = {
  compact: 'lg:col-span-1',
  standard: 'lg:col-span-2',
  expanded: 'lg:col-span-4',
}

function CardHost({ card, size }: { card: DashboardCard; size: CardSize }) {
  const data = card.useData()
  return <>{card.render({ size, data })}</>
}

/** Nearest scrollable ancestor (the app shell scrolls a <main>, not the window). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement || null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** Move the dragged card into the target's slot, shifting the rest (no swap). */
function liveMove(cur: CardPlacement[], dragId: string, targetId: string): CardPlacement[] {
  const ordered = [...cur].sort((a, b) => a.order - b.order)
  const from = ordered.findIndex((b) => b.blockId === dragId)
  const to = ordered.findIndex((b) => b.blockId === targetId)
  if (from === -1 || to === -1 || from === to) return cur
  const next = [...ordered]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.map((b, i) => ({ ...b, order: i }))
}

function AddCardMenu({ options, onAdd }: { options: CardMeta[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const none = options.length === 0
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !none && setOpen((o) => !o)}
        disabled={none}
        className="rounded-tlw-lg border border-tlw-warm-gray/30 bg-tlw-surface px-3 py-1.5 text-[13px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-canvas disabled:opacity-40"
      >
        {none ? 'All cards added' : '+ Add card'}
      </button>
      {open && !none && (
        <div className="absolute right-0 z-10 mt-1 max-h-80 w-56 overflow-y-auto rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface py-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onAdd(o.id)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              {o.icon ? `${o.icon} ` : ''}
              {o.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardSurface() {
  const [blocks, setBlocks] = useState<CardPlacement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [arranging, setArranging] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const dragYRef = useRef(0)
  // Latest blocks (for the dragEnd persist) + FLIP bookkeeping.
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const elRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevRects = useRef<Record<string, DOMRect>>({})

  useEffect(() => {
    let active = true
    fetch('/api/dashboard/layout')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setBlocks(d.blocks || []))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  // FLIP: after the order changes during a drag, slide each card from its old
  // box to its new one so the reflow animates (iOS-style nudge). The dragged card
  // is held by the cursor, so it isn't animated.
  useIsoLayoutEffect(() => {
    const prev = prevRects.current
    if (!prev || Object.keys(prev).length === 0) return
    for (const id in elRefs.current) {
      if (id === dragId) continue
      const el = elRefs.current[id]
      const before = prev[id]
      if (!el || !before) continue
      const now = el.getBoundingClientRect()
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (dx === 0 && dy === 0) continue
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      void el.offsetWidth // force reflow so the next frame animates
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease'
        el.style.transform = ''
      })
    }
    prevRects.current = {}
  }, [blocks, dragId])

  function captureRects() {
    const m: Record<string, DOMRect> = {}
    for (const id in elRefs.current) {
      const el = elRefs.current[id]
      if (el) m[id] = el.getBoundingClientRect()
    }
    prevRects.current = m
  }

  // Edge auto-scroll while dragging: when the pointer nears the top/bottom of the
  // scroll container, scroll it so a card can be dropped beyond the current view.
  useEffect(() => {
    if (!dragId) return
    const container = findScrollParent(rootRef.current)
    const EDGE = 90 // px from an edge that triggers scrolling
    const MAX = 22 // max px/frame, scaled by how deep into the edge zone
    let raf = 0

    const onWinDragOver = (e: DragEvent) => {
      dragYRef.current = e.clientY
    }
    window.addEventListener('dragover', onWinDragOver)

    const tick = () => {
      const y = dragYRef.current
      const top = container ? container.getBoundingClientRect().top : 0
      const bottom = container ? container.getBoundingClientRect().bottom : window.innerHeight
      let dy = 0
      if (y < top + EDGE) dy = -Math.ceil(MAX * Math.min(1, (top + EDGE - y) / EDGE))
      else if (y > bottom - EDGE) dy = Math.ceil(MAX * Math.min(1, (y - (bottom - EDGE)) / EDGE))
      if (dy !== 0) {
        if (container) container.scrollTop += dy
        else window.scrollBy(0, dy)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('dragover', onWinDragOver)
      cancelAnimationFrame(raf)
    }
  }, [dragId])

  // Optimistic update + persist. The server normalizes and echoes the stored
  // result; we re-sync to it so client and server never drift.
  const persist = useCallback((next: CardPlacement[]) => {
    setBlocks(next)
    fetch('/api/dashboard/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: next }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.blocks && setBlocks(d.blocks))
      .catch(() => {
        /* last-write-wins; a dropped save retries on the next mutation */
      })
  }, [])

  const addCard = useCallback(
    (id: string) => {
      const meta = DASHBOARD_CARDS[id]
      if (!meta) return
      setBlocks((cur) => {
        if (cur.some((b) => b.blockId === id)) return cur
        const next = [...cur, { blockId: id, size: meta.defaultSize, order: cur.length }]
        persist(next)
        return next
      })
    },
    [persist]
  )

  const resizeCard = useCallback(
    (id: string, size: CardSize) => {
      setBlocks((cur) => {
        const next = cur.map((b) => (b.blockId === id ? { ...b, size } : b))
        persist(next)
        return next
      })
    },
    [persist]
  )

  const removeCard = useCallback(
    (id: string) => {
      setBlocks((cur) => {
        const next = cur.filter((b) => b.blockId !== id).map((b, i) => ({ ...b, order: i }))
        persist(next)
        return next
      })
    },
    [persist]
  )

  const ordered = [...blocks].sort((a, b) => a.order - b.order)
  const addable = availableToAdd(blocks.map((b) => b.blockId))

  return (
    <div ref={rootRef}>
      <div className="mb-4 flex items-center justify-end gap-2">
        {ordered.length > 1 && (
          <button
            onClick={() => {
              setArranging((a) => !a)
              setDragId(null)
            }}
            title="Drag cards to reorder"
            className={`flex items-center gap-1.5 rounded-tlw-lg border px-3 py-1.5 text-[13px] font-medium transition-colors ${
              arranging
                ? 'border-tlw-navy-rich bg-tlw-navy-rich/10 text-tlw-navy-rich'
                : 'border-tlw-warm-gray/30 text-tlw-espresso hover:bg-tlw-canvas'
            }`}
          >
            {arranging ? 'Done' : 'Arrange'}
          </button>
        )}
        <AddCardMenu options={addable} onAdd={addCard} />
      </div>

      {arranging && (
        <p className="mb-3 text-[12px] text-tlw-warm-gray">
          Drag a card into a new spot — the others slide out of the way. Resize with S/M/L. Press Done when finished.
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="h-40 animate-pulse rounded-tlw-2xl bg-tlw-surface/70 lg:col-span-2" />
        </div>
      ) : error ? (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/20 bg-tlw-surface p-6 text-center text-[13px] text-tlw-espresso">
          Couldn&apos;t load your dashboard.
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">Your dashboard is empty</p>
          <p className="mt-1 max-w-sm text-[13px] text-tlw-warm-gray">
            Add cards to build your cockpit — clients, upcoming sessions, revenue, calendar, and more. Use “Add card” above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {ordered.map((b) => {
            const card = getDashboardCard(b.blockId)
            if (!card) return null // unknown/unregistered card — skip gracefully
            return (
              <div
                key={b.blockId}
                ref={(el) => {
                  elRefs.current[b.blockId] = el
                }}
                className={`${card.fixedSpan ?? SPAN[b.size]} ${arranging ? 'cursor-move' : ''} ${
                  dragId === b.blockId ? 'opacity-40' : ''
                }`}
                draggable={arranging}
                onDragStart={() => arranging && setDragId(b.blockId)}
                onDragEnd={() => {
                  if (dragId) persist(blocksRef.current)
                  setDragId(null)
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === b.blockId) return
                  e.preventDefault()
                  captureRects()
                  setBlocks((cur) => liveMove(cur, dragId, b.blockId))
                }}
                onDrop={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                }}
              >
                <CardFrame
                  title={card.title}
                  icon={card.icon}
                  selfHeader={card.selfHeader}
                  size={b.size}
                  supportedSizes={card.supportedSizes}
                  onResize={(s) => resizeCard(b.blockId, s)}
                  onRemove={() => removeCard(b.blockId)}
                  arranging={arranging}
                >
                  <CardHost card={card} size={b.size} />
                </CardFrame>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
