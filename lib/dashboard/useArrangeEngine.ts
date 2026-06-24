'use client'
/**
 * useArrangeEngine — shared drag/FLIP/auto-scroll hook consumed by both
 * DashboardSurface and WorkspaceSurface.
 *
 * Encapsulates everything needed for iOS-style live-reorder:
 *  - live insert + shift on dragOver (never a swap)
 *  - FLIP animation: measure before/after, glide 180ms ease into new slots;
 *    the dragged card is held by the cursor so it is never animated
 *  - edge auto-scroll: 90px trigger zone, 22px/frame max, rAF tick
 *
 * The calling surface owns layout state (`blocks`/`setBlocks`/`persist`) and
 * its own `rootRef`. The hook owns `dragId`, all refs, and the two effects.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type React from 'react'
import type { CardPlacement } from './types'

// Run layout effects on the client only — avoids the SSR useLayoutEffect warning.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Nearest scrollable ancestor (the app shell scrolls <main>, not window). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement || null
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** Move the dragged card into the target slot, shifting the rest (no swap). */
export function liveMoveBlocks(
  cur: CardPlacement[],
  dragId: string,
  targetId: string
): CardPlacement[] {
  const ordered = [...cur].sort((a, b) => a.order - b.order)
  const from = ordered.findIndex((b) => b.blockId === dragId)
  const to = ordered.findIndex((b) => b.blockId === targetId)
  if (from === -1 || to === -1 || from === to) return cur
  const next = [...ordered]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.map((b, i) => ({ ...b, order: i }))
}

export interface ArrangeEngineResult {
  /** blockId of the card currently being dragged, or null. */
  dragId: string | null
  /** Assign each card's DOM node here via `ref={(el) => { elRefs.current[id] = el }}`. */
  elRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  /** Returns the four drag event props for a card's wrapper div. */
  getDragHandlers: (blockId: string) => {
    draggable: boolean
    onDragStart: () => void
    onDragEnd: () => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  /** Call when toggling Arrange mode off to reset any in-progress drag. */
  clearDrag: () => void
}

export function useArrangeEngine({
  blocks,
  setBlocks,
  persist,
  enabled,
  rootRef,
}: {
  blocks: CardPlacement[]
  setBlocks: (updater: (cur: CardPlacement[]) => CardPlacement[]) => void
  persist: (next: CardPlacement[]) => void
  enabled: boolean
  rootRef: RefObject<HTMLDivElement | null>
}): ArrangeEngineResult {
  const [dragId, setDragId] = useState<string | null>(null)
  const dragYRef = useRef(0)
  // Keep the latest blocks accessible in dragEnd without a stale closure.
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const elRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const prevRects = useRef<Record<string, DOMRect>>({})

  // FLIP: after a live-move the grid reflows; for each card compute how far it
  // moved, play it back instantly, then animate forward to (0,0) — 180ms ease.
  useIsoLayoutEffect(() => {
    const prev = prevRects.current
    if (!prev || Object.keys(prev).length === 0) return
    for (const id in elRefs.current) {
      if (id === dragId) continue // dragged card is held by cursor, skip
      const el = elRefs.current[id]
      const before = prev[id]
      if (!el || !before) continue
      const now = el.getBoundingClientRect()
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (dx === 0 && dy === 0) continue
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      void el.offsetWidth // force reflow so the next frame sees the transform
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease'
        el.style.transform = ''
      })
    }
    prevRects.current = {}
  }, [blocks, dragId])

  // Edge auto-scroll: when the pointer nears the top/bottom of the scroll
  // container, scroll it so cards can be dropped beyond the current viewport.
  useEffect(() => {
    if (!dragId) return
    const container = findScrollParent(rootRef.current)
    const EDGE = 90 // px from an edge that triggers scrolling
    const MAX = 22  // max px/frame, scaled by depth into the edge zone
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
  }, [dragId, rootRef])

  function captureRects() {
    const m: Record<string, DOMRect> = {}
    for (const id in elRefs.current) {
      const el = elRefs.current[id]
      if (el) m[id] = el.getBoundingClientRect()
    }
    prevRects.current = m
  }

  function getDragHandlers(blockId: string) {
    return {
      draggable: enabled,
      onDragStart: () => {
        if (enabled) setDragId(blockId)
      },
      onDragEnd: () => {
        if (dragId) persist(blocksRef.current)
        setDragId(null)
      },
      onDragOver: (e: React.DragEvent) => {
        if (!dragId || dragId === blockId) return
        e.preventDefault()
        captureRects()
        setBlocks((cur) => liveMoveBlocks(cur, dragId, blockId))
      },
      onDrop: (e: React.DragEvent) => {
        if (!dragId) return
        e.preventDefault()
      },
    }
  }

  return {
    dragId,
    elRefs,
    getDragHandlers,
    clearDrag: () => setDragId(null),
  }
}
