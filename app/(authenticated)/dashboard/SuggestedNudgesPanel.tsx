'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Suggestion {
  id: string
  client_id: string
  client_name: string
  type: string
  last_appointment: string | null
}

const TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
  goals: 'Goals',
  reengagement: 'Re-engagement',
}

/**
 * Homepage lego: the coach's draft (suggested) nudges across clients — client
 * name, their last appointment, and the suggested nudge type. Each row deep-links
 * into the Nudge Queue, focused on that suggestion. Add/remove via the page's
 * Arrange gear.
 */
export function SuggestedNudgesPanel({ timeZone }: { timeZone: string }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [skipping, setSkipping] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/nudges/suggested')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setItems(d.suggestions || [])
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // Skip a suggestion in place (PATCH … action:'skip'), optimistic with revert.
  async function skip(id: string) {
    const prev = items
    setSkipping(id)
    setItems((cur) => cur.filter((s) => s.id !== id))
    try {
      const res = await fetch(`/api/nudges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems(prev) // restore on failure
    } finally {
      setSkipping(null)
    }
  }

  function apptLabel(iso: string | null): string {
    if (!iso) return 'No recent session'
    try {
      return `Last session ${new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone,
      })}`
    } catch {
      return 'Last session —'
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Suggested nudges
          {!loading && !error && items.length > 0 && (
            <span className="ml-2 rounded-full bg-tlw-navy-rich/10 px-2 py-[1px] text-[11px] font-semibold text-tlw-navy-rich">
              {items.length}
            </span>
          )}
        </p>
        <Link href="/nudges" className="text-[12px] font-medium text-tlw-signal-orange hover:underline">
          Review all →
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-6 text-center text-[13px] text-tlw-espresso">
          Couldn&apos;t load suggestions.
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No suggested nudges right now.</p>
          <p className="mt-1 text-[12px] text-tlw-warm-gray">
            New drafts appear after a session is scored.
          </p>
        </div>
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {items.map((s) => (
            <div
              key={s.id}
              className="group flex items-center justify-between gap-3 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
            >
              <Link href={`/nudges?focus=${s.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{s.client_name}</p>
                <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
                  {apptLabel(s.last_appointment)}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-full bg-tlw-navy-rich/10 px-2.5 py-0.5 text-[11px] font-medium text-tlw-navy-rich">
                  {TYPE_LABEL[s.type] || s.type}
                </span>
                <button
                  onClick={() => skip(s.id)}
                  disabled={skipping === s.id}
                  title="Skip this suggestion"
                  aria-label="Skip this suggestion"
                  className="rounded-md px-1.5 py-0.5 text-[14px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
