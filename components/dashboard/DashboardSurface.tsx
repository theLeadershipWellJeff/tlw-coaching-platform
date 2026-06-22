'use client'
/**
 * DashboardSurface — the run-time arrangement layer for the coach's dashboard.
 *
 * Loads the coach's stored layout, renders the placed cards into a grid, and
 * lets the coach add / remove / resize cards. Every mutation persists to
 * `/api/dashboard/layout` (last-write-wins) so the dashboard survives reloads.
 *
 * Each placed card is hosted once (CardHost), so its data hook runs a single
 * time per instance — resizing changes the `size` prop without remounting, and
 * therefore never refetches (brief §3.2 / §5).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { availableToAdd } from '@/lib/dashboard/cards'
import type { CardMeta, CardPlacement, CardSize, DashboardCard } from '@/lib/dashboard/types'
import { DASHBOARD_CARDS, getDashboardCard } from './registry'
import { CardFrame } from './CardFrame'

// compact = 1 col · standard = 2 col · expanded = full row, on a 4-col desktop
// grid. Literal classes so Tailwind keeps them.
const SPAN: Record<CardSize, string> = {
  compact: 'lg:col-span-1',
  standard: 'lg:col-span-2',
  expanded: 'lg:col-span-4',
}

function CardHost({ card, size }: { card: DashboardCard; size: CardSize }) {
  const data = card.useData()
  return <>{card.render({ size, data })}</>
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
        <div className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface py-1 shadow-lg">
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
    <div>
      <div className="mb-4 flex items-center justify-end">
        <AddCardMenu options={addable} onAdd={addCard} />
      </div>

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
            Add cards to build your cockpit — revenue, calendar, emails, and more. Use “Add card” above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {ordered.map((b) => {
            const card = getDashboardCard(b.blockId)
            if (!card) return null // unknown/unregistered card — skip gracefully
            return (
              <div key={b.blockId} className={SPAN[b.size]}>
                <CardFrame
                  title={card.title}
                  icon={card.icon}
                  size={b.size}
                  supportedSizes={card.supportedSizes}
                  onResize={(s) => resizeCard(b.blockId, s)}
                  onRemove={() => removeCard(b.blockId)}
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
