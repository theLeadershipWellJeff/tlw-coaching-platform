'use client'
/**
 * WorkspaceSurface — the run-time arrangement layer for the client workspace.
 *
 * Behaviour is identical to DashboardSurface: add / remove / resize cards,
 * and iOS-style live-reorder drag with FLIP animation and edge auto-scroll.
 * Both surfaces share one implementation via the `useArrangeEngine` hook
 * (lib/dashboard/useArrangeEngine.ts) — the 180ms timing knob and all drag
 * behaviour live in exactly one place.
 *
 * THE HARD RULE: layout is coach-global. clientId never enters the layout read
 * or write path. The API uses `WHERE coach_id = :me AND surface = 'client_workspace'`
 * only. Per-client data flows through WorkspaceContext, not the layout.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { WORKSPACE_BLOCK_META, workspaceBlocksAvailableToAdd } from '@/lib/dashboard/workspaceBlocks'
import type { WorkspaceBlockMeta } from '@/lib/dashboard/workspaceBlocks'
import { useArrangeEngine } from '@/lib/dashboard/useArrangeEngine'
import type { CardPlacement, CardSize } from '@/lib/dashboard/types'
import { getWorkspaceBlock } from './WorkspaceRegistry'
import { CardFrame } from '@/components/dashboard/CardFrame'

const SPAN: Record<CardSize, string> = {
  compact: 'lg:col-span-1',
  standard: 'lg:col-span-2',
  expanded: 'lg:col-span-4',
}

function AddCardMenu({
  options,
  onAdd,
}: {
  options: WorkspaceBlockMeta[]
  onAdd: (id: string) => void
}) {
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

export function WorkspaceSurface() {
  const [blocks, setBlocks] = useState<CardPlacement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [arranging, setArranging] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    fetch('/api/workspace/layout')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setBlocks(d.blocks || []))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const persist = useCallback((next: CardPlacement[]) => {
    setBlocks(next)
    fetch('/api/workspace/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: next }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.blocks && setBlocks(d.blocks))
      .catch(() => {})
  }, [])

  const { dragId, elRefs, getDragHandlers, clearDrag } = useArrangeEngine({
    blocks,
    setBlocks,
    persist,
    enabled: arranging,
    rootRef,
  })

  const addCard = useCallback(
    (id: string) => {
      const meta = WORKSPACE_BLOCK_META[id]
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
  const addable = workspaceBlocksAvailableToAdd(blocks.map((b) => b.blockId))

  return (
    <div ref={rootRef}>
      <div className="mb-4 flex items-center justify-end gap-2">
        {ordered.length > 1 && (
          <button
            onClick={() => {
              setArranging((a) => !a)
              clearDrag()
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
          <div className="h-40 animate-pulse rounded-tlw-2xl bg-tlw-surface/70 lg:col-span-2" />
        </div>
      ) : error ? (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/20 bg-tlw-surface p-6 text-center text-[13px] text-tlw-espresso">
          Couldn&apos;t load workspace layout.
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">Workspace is empty</p>
          <p className="mt-1 max-w-sm text-[13px] text-tlw-warm-gray">
            Use &ldquo;Add card&rdquo; above to restore panels — sessions, goals, actions, and more.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {ordered.map((b) => {
            const BlockComponent = getWorkspaceBlock(b.blockId)
            const meta = WORKSPACE_BLOCK_META[b.blockId]
            if (!BlockComponent || !meta) return null
            return (
              <div
                key={b.blockId}
                ref={(el) => {
                  elRefs.current[b.blockId] = el
                }}
                className={`${SPAN[b.size]} ${arranging ? 'cursor-move' : ''} ${
                  dragId === b.blockId ? 'opacity-40' : ''
                }`}
                {...getDragHandlers(b.blockId)}
              >
                <CardFrame
                  title={meta.title}
                  icon={meta.icon}
                  selfHeader={meta.selfHeader}
                  size={b.size}
                  supportedSizes={meta.supportedSizes}
                  onResize={(s) => resizeCard(b.blockId, s)}
                  onRemove={() => removeCard(b.blockId)}
                  arranging={arranging}
                >
                  <BlockComponent size={b.size} />
                </CardFrame>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
