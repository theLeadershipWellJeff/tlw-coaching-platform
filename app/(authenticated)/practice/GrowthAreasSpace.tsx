'use client'
import { useEffect, useState } from 'react'
import type { CoachGrowthArea } from '@/lib/supabase/types'
import { GrowthAreaEditor } from './GrowthAreaEditor'

const MAX_ACTIVE = 5

// ── Band preview ──────────────────────────────────────────────────────────────

function BandDot({ band }: { band: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
      style={{
        backgroundColor: `var(--color-info)20`,
        color: 'var(--color-info)',
      }}
    >
      {band}
    </span>
  )
}

// ── Area row (list view) ──────────────────────────────────────────────────────

function AreaRow({
  area,
  onEdit,
  onStatusChange,
}: {
  area: CoachGrowthArea
  onEdit: () => void
  onStatusChange: (area: CoachGrowthArea) => void
}) {
  const [toggling, setToggling] = useState(false)
  const hasBands = area.band_scale.length === 5

  async function toggleStatus() {
    setToggling(true)
    const next = area.status === 'active' ? 'archived' : 'active'
    try {
      const res = await fetch(`/api/growth-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await res.json()
      if (res.ok) onStatusChange(data.area)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-tlw-navy-deep">{area.title}</p>
            {area.status === 'archived' && (
              <span className="rounded-full border border-tlw-warm-gray/20 px-2 py-0.5 text-[10px] font-medium text-tlw-warm-gray">
                archived
              </span>
            )}
          </div>
          {area.description && (
            <p className="mt-1 text-[12px] leading-relaxed text-tlw-warm-gray">{area.description}</p>
          )}
          {hasBands && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-[11px] text-tlw-warm-gray">Scale:</span>
              {area.band_scale.map((b) => (
                <BandDot key={b.band} band={b.band} />
              ))}
            </div>
          )}
          {!hasBands && (
            <p className="mt-2 text-[11px] text-tlw-warm-gray italic">No band scale yet — edit to add one.</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onEdit} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
            edit
          </button>
          <button
            onClick={toggleStatus}
            disabled={toggling}
            className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-signal-orange disabled:opacity-40"
          >
            {toggling ? '…' : area.status === 'active' ? 'archive' : 'restore'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function GrowthAreasSpace() {
  const [areas, setAreas] = useState<CoachGrowthArea[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    fetch('/api/growth-areas')
      .then((r) => r.json())
      .then((d) => setAreas(d.areas ?? []))
      .finally(() => setLoading(false))
  }, [])

  const active = areas.filter((a) => a.status === 'active')
  const archived = areas.filter((a) => a.status === 'archived')
  const atCap = active.length >= MAX_ACTIVE

  function handleSaved(saved: CoachGrowthArea) {
    setAreas((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [...prev, saved]
    })
    setEditingId(null)
  }

  function handleStatusChange(updated: CoachGrowthArea) {
    setAreas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  if (loading) {
    return (
      <div className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
        <p className="text-[13px] text-tlw-warm-gray">Loading growth areas…</p>
      </div>
    )
  }

  // Editor view (create or edit).
  if (editingId !== null) {
    const area = editingId === 'new' ? undefined : areas.find((a) => a.id === editingId)
    return (
      <div className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-tlw-navy-deep">
            {editingId === 'new' ? 'New growth area' : 'Edit growth area'}
          </h2>
        </div>
        <div className="max-w-2xl">
          <GrowthAreaEditor
            area={area}
            onSaved={handleSaved}
            onCancel={() => setEditingId(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="pt-8" style={{ borderTop: '0.5px solid var(--color-divider)' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-tlw-navy-deep">Growth Areas</h2>
          <p className="mt-0.5 text-[12px] text-tlw-warm-gray">
            Personal development focuses for your coaching craft. Each scored session is assessed against your active
            areas.
          </p>
        </div>
        <button
          onClick={() => setEditingId('new')}
          disabled={atCap}
          title={atCap ? `Maximum ${MAX_ACTIVE} active growth areas. Archive one to add another.` : undefined}
          className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add growth area
        </button>
      </div>

      {atCap && (
        <p className="mb-4 rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface px-4 py-3 text-[12px] text-tlw-warm-gray">
          You have {MAX_ACTIVE} active growth areas — the maximum. Archive one to make room for another.
        </p>
      )}

      {active.length === 0 && archived.length === 0 ? (
        <div className="rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-tlw-navy-deep">No growth areas yet</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            Add a focus for your coaching craft — the scoring pipeline will assess each session against it.
          </p>
          <button
            onClick={() => setEditingId('new')}
            className="mt-4 rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream hover:opacity-90"
          >
            Add your first growth area
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((area) => (
            <AreaRow
              key={area.id}
              area={area}
              onEdit={() => setEditingId(area.id)}
              onStatusChange={handleStatusChange}
            />
          ))}

          {archived.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso"
              >
                {showArchived ? '▾ Hide archived' : `▸ Show archived (${archived.length})`}
              </button>
              {showArchived && (
                <div className="mt-3 space-y-3">
                  {archived.map((area) => (
                    <AreaRow
                      key={area.id}
                      area={area}
                      onEdit={() => setEditingId(area.id)}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
