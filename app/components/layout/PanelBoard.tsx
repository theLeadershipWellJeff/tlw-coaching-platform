'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface Panel {
  id: string
  /** Short label shown on the drag handle while arranging. */
  label: string
  node: ReactNode
}

interface PanelBoardProps {
  /** localStorage key the arrangement is persisted under (per page). */
  storageKey: string
  /** The panels available to show, with their rendered content. */
  panels: Panel[]
  /** Number of columns to lay panels out across (1 or 2). */
  columns?: number
  /** Default arrangement: an array of columns, each an ordered list of panel ids. */
  defaultLayout: string[][]
}

// The persisted board: the visible layout plus the ids the coach has removed
// (hidden). Removed ids stay hidden across reloads and code changes.
type Board = { layout: string[][]; removed: string[] }
type DropTarget = { col: number; beforeId: string | null }

/**
 * A drag-to-arrange board. Panels live in one or two columns; in "arrange" mode the
 * coach can reorder them, move them between columns, and add/remove them (a removed
 * panel drops into a "Hidden" tray it can be re-added from). The arrangement
 * persists per page in localStorage. Unknown saved ids are dropped and
 * newly-introduced panels appear in their default position, so a saved layout
 * survives code changes; an intentionally-removed panel stays hidden.
 */
export function PanelBoard({ storageKey, panels, columns = 1, defaultLayout }: PanelBoardProps) {
  const defaultRef = useRef(defaultLayout)
  const idsKey = panels.map((p) => p.id).join('|')

  const [board, setBoard] = useState<Board>(() => reconcile(null, panels, defaultRef.current, columns))
  const [hydrated, setHydrated] = useState(false)
  const [arranging, setArranging] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  // Read the saved arrangement once, on the client, to avoid hydration drift.
  useEffect(() => {
    let saved: Board | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) saved = normalizeSaved(JSON.parse(raw))
    } catch {
      /* ignore malformed state */
    }
    setBoard(reconcile(saved, panels, defaultRef.current, columns))
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // When the set of available panels changes (e.g. a new panel ships), fold the
  // change into the coach's current order rather than resetting it.
  useEffect(() => {
    if (!hydrated) return
    setBoard((prev) => reconcile(prev, panels, defaultRef.current, columns))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, columns])

  // Persist after every change once hydrated.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(board))
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [board, hydrated, storageKey])

  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels])

  function applyDrop() {
    if (!dragId || !drop) return
    setBoard((prev) => {
      const layout: string[][] = prev.layout.map((c) => c.filter((id) => id !== dragId))
      const arr = layout[drop.col] || (layout[drop.col] = [])
      if (drop.beforeId == null) arr.push(dragId)
      else {
        const i = arr.indexOf(drop.beforeId)
        if (i === -1) arr.push(dragId)
        else arr.splice(i, 0, dragId)
      }
      return { layout, removed: prev.removed }
    })
    setDragId(null)
    setDrop(null)
  }

  function removePanel(id: string) {
    setBoard((prev) => ({
      layout: prev.layout.map((c) => c.filter((pid) => pid !== id)),
      removed: prev.removed.includes(id) ? prev.removed : [...prev.removed, id],
    }))
  }

  function addPanel(id: string) {
    setBoard((prev) => {
      const defCol = defaultColumnOf(id, defaultRef.current, columns)
      const layout = prev.layout.map((c, ci) => (ci === defCol ? [...c, id] : c))
      // Guard: ensure the target column exists.
      while (layout.length < columns) layout.push([])
      if (!layout[defCol].includes(id)) layout[defCol].push(id)
      return { layout, removed: prev.removed.filter((rid) => rid !== id) }
    })
  }

  function reset() {
    setBoard(reconcile(null, panels, defaultRef.current, columns))
  }

  const gridClass =
    columns === 2
      ? 'grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start'
      : 'grid grid-cols-1 gap-6'

  const removedPanels = board.removed.map((id) => byId.get(id)).filter((p): p is Panel => !!p)

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        {arranging && (
          <button
            onClick={reset}
            className="rounded-tlw-lg px-3 py-1.5 text-[12px] font-medium text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
          >
            Reset layout
          </button>
        )}
        <button
          onClick={() => {
            setArranging((a) => !a)
            setDragId(null)
            setDrop(null)
          }}
          className={`flex items-center gap-1.5 rounded-tlw-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            arranging
              ? 'border-tlw-signal-orange bg-tlw-signal-orange/10 text-tlw-signal-orange'
              : 'border-tlw-warm-gray/30 text-tlw-espresso hover:border-tlw-warm-gray/50'
          }`}
          title="Rearrange, add, or remove the panels on this page"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {arranging ? 'Done' : 'Arrange'}
        </button>
      </div>

      <div className={gridClass}>
        {board.layout.map((colIds, ci) => (
          <div
            key={ci}
            className="space-y-6"
            onDragOver={(e) => {
              // Only claim the drop when hovering the column's own padding, not
              // a child panel (which sets its own, more precise, target).
              if (!dragId || e.target !== e.currentTarget) return
              e.preventDefault()
              setDrop({ col: ci, beforeId: null })
            }}
            onDrop={(e) => {
              if (!dragId) return
              e.preventDefault()
              applyDrop()
            }}
          >
            {colIds.map((id) => {
              const panel = byId.get(id)
              if (!panel) return null
              const showLine = drop?.col === ci && drop.beforeId === id
              const isDragging = dragId === id
              return (
                <div key={id}>
                  {showLine && <div className="mb-2 h-0.5 rounded-full bg-tlw-signal-orange" />}
                  <div
                    draggable={arranging}
                    onDragStart={() => setDragId(id)}
                    onDragEnd={() => {
                      setDragId(null)
                      setDrop(null)
                    }}
                    onDragOver={(e) => {
                      if (!dragId) return
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      const after = e.clientY > rect.top + rect.height / 2
                      const myIndex = colIds.indexOf(id)
                      const beforeId = after ? colIds[myIndex + 1] ?? null : id
                      if (beforeId === dragId) return
                      setDrop({ col: ci, beforeId })
                    }}
                    onDrop={(e) => {
                      if (!dragId) return
                      e.preventDefault()
                      applyDrop()
                    }}
                    className={`${arranging ? 'rounded-tlw-2xl ring-1 ring-tlw-warm-gray/25' : ''} ${
                      isDragging ? 'opacity-40' : ''
                    }`}
                  >
                    {arranging && (
                      <div className="flex items-center justify-between gap-2 rounded-t-tlw-2xl bg-tlw-warm-gray/10 px-3 py-2">
                        <div className="flex cursor-grab items-center gap-2 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray active:cursor-grabbing">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <circle cx="9" cy="6" r="1.4" />
                            <circle cx="15" cy="6" r="1.4" />
                            <circle cx="9" cy="12" r="1.4" />
                            <circle cx="15" cy="12" r="1.4" />
                            <circle cx="9" cy="18" r="1.4" />
                            <circle cx="15" cy="18" r="1.4" />
                          </svg>
                          {panel.label}
                        </div>
                        <button
                          onClick={() => removePanel(id)}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
                          title={`Remove ${panel.label}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    <div className={arranging ? 'pointer-events-none select-none p-3' : ''}>{panel.node}</div>
                  </div>
                </div>
              )
            })}

            {arranging && (
              <div
                onDragOver={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  setDrop({ col: ci, beforeId: null })
                }}
                onDrop={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  applyDrop()
                }}
                className={`rounded-tlw-2xl border-2 border-dashed px-4 py-6 text-center text-[11px] uppercase tracking-[1.5px] transition-colors ${
                  drop?.col === ci && drop.beforeId === null
                    ? 'border-tlw-signal-orange text-tlw-signal-orange'
                    : 'border-tlw-warm-gray/25 text-tlw-warm-gray'
                }`}
              >
                Drop here
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hidden-panel tray: add removed panels back. Only in arrange mode. */}
      {arranging && removedPanels.length > 0 && (
        <div className="mt-6 rounded-tlw-2xl border border-dashed border-tlw-warm-gray/30 bg-tlw-warm-gray/[0.04] p-4">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
            Hidden panels
          </p>
          <div className="flex flex-wrap gap-2">
            {removedPanels.map((p) => (
              <button
                key={p.id}
                onClick={() => addPanel(p.id)}
                className="flex items-center gap-1.5 rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-signal-orange hover:text-tlw-signal-orange"
              >
                <span className="text-[14px] leading-none">+</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Coerce a saved value (old `string[][]` or new `Board`) into a Board, or null. */
function normalizeSaved(parsed: unknown): Board | null {
  if (Array.isArray(parsed)) return { layout: parsed as string[][], removed: [] }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Board).layout)) {
    const b = parsed as Board
    return { layout: b.layout, removed: Array.isArray(b.removed) ? b.removed : [] }
  }
  return null
}

function defaultColumnOf(id: string, def: string[][], columns: number): number {
  for (let ci = 0; ci < def.length; ci++) {
    if (def[ci].includes(id)) return Math.min(ci, columns - 1)
  }
  return 0
}

/** Rebuild a board from a (possibly stale) source, keeping only known panel ids:
 *  placed ids keep their order, intentionally-removed ids stay hidden, and any
 *  not-yet-seen panel is folded into its default column. */
function reconcile(source: Board | null, panels: Panel[], def: string[][], columns: number): Board {
  const ids = panels.map((p) => p.id)
  const idSet = new Set(ids)
  const removed = (source?.removed || []).filter((id) => idSet.has(id))
  const removedSet = new Set(removed)

  const base = source?.layout?.length ? source.layout : def
  const out: string[][] = Array.from({ length: columns }, () => [])
  const placed = new Set<string>()
  const seen = new Set<string>()

  base.forEach((colIds, ci) => {
    const target = Math.min(ci, columns - 1)
    colIds.forEach((id) => {
      seen.add(id)
      if (idSet.has(id) && !placed.has(id) && !removedSet.has(id)) {
        out[target].push(id)
        placed.add(id)
      }
    })
  })

  // New panels (never seen, not removed) → fold into their default column.
  ids.forEach((id) => {
    if (!placed.has(id) && !removedSet.has(id) && !seen.has(id)) {
      out[defaultColumnOf(id, def, columns)].push(id)
      placed.add(id)
    }
  })

  return { layout: out, removed }
}
