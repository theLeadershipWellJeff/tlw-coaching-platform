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

type Layout = string[][]
type DropTarget = { col: number; beforeId: string | null }

/**
 * A drag-to-arrange board. Panels live in one or two columns; the coach can
 * reorder them and move them between columns in "arrange" mode, and the layout
 * persists per page in localStorage (same pattern as the sidebar-collapsed
 * state). Unknown saved ids are dropped and newly-introduced panels are added
 * back in at their default position, so the saved layout survives code changes.
 */
export function PanelBoard({ storageKey, panels, columns = 1, defaultLayout }: PanelBoardProps) {
  const defaultRef = useRef(defaultLayout)
  const idsKey = panels.map((p) => p.id).join('|')

  const [layout, setLayout] = useState<Layout>(() => reconcile(null, panels, defaultRef.current, columns))
  const [hydrated, setHydrated] = useState(false)
  const [arranging, setArranging] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  // Read the saved arrangement once, on the client, to avoid hydration drift.
  useEffect(() => {
    let saved: Layout | null = null
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) saved = JSON.parse(raw)
    } catch {
      /* ignore malformed state */
    }
    setLayout(reconcile(saved, panels, defaultRef.current, columns))
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // When the set of available panels changes (e.g. needs-review appears), fold
  // the change into the user's current order rather than resetting it.
  useEffect(() => {
    if (!hydrated) return
    setLayout((prev) => reconcile(prev, panels, defaultRef.current, columns))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, columns])

  // Persist after every change once hydrated.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout))
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [layout, hydrated, storageKey])

  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels])

  function applyDrop() {
    if (!dragId || !drop) return
    setLayout((prev) => {
      const next: Layout = prev.map((c) => c.filter((id) => id !== dragId))
      const arr = next[drop.col] || (next[drop.col] = [])
      if (drop.beforeId == null) arr.push(dragId)
      else {
        const i = arr.indexOf(drop.beforeId)
        if (i === -1) arr.push(dragId)
        else arr.splice(i, 0, dragId)
      }
      return next
    })
    setDragId(null)
    setDrop(null)
  }

  function reset() {
    setLayout(reconcile(null, panels, defaultRef.current, columns))
  }

  const gridClass =
    columns === 2
      ? 'grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start'
      : 'grid grid-cols-1 gap-6'

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
          title="Rearrange the panels on this page"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {arranging ? 'Done' : 'Arrange'}
        </button>
      </div>

      <div className={gridClass}>
        {layout.map((colIds, ci) => (
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
                      <div className="flex cursor-grab items-center gap-2 rounded-t-tlw-2xl bg-tlw-warm-gray/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray active:cursor-grabbing">
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
    </div>
  )
}

/** Rebuild a layout from a (possibly stale) source, keeping only known panel
 *  ids and folding any not-yet-placed panels into their default column. */
function reconcile(source: Layout | null, panels: Panel[], def: Layout, columns: number): Layout {
  const ids = panels.map((p) => p.id)
  const idSet = new Set(ids)
  const out: Layout = Array.from({ length: columns }, () => [])
  const placed = new Set<string>()

  const base = source && source.length ? source : def
  base.forEach((colIds, ci) => {
    const target = Math.min(ci, columns - 1)
    colIds.forEach((id) => {
      if (idSet.has(id) && !placed.has(id)) {
        out[target].push(id)
        placed.add(id)
      }
    })
  })

  const defCol = new Map<string, number>()
  def.forEach((colIds, ci) => colIds.forEach((id) => defCol.set(id, Math.min(ci, columns - 1))))
  ids.forEach((id) => {
    if (!placed.has(id)) {
      out[defCol.get(id) ?? 0].push(id)
      placed.add(id)
    }
  })

  return out
}
