'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Client } from '@/lib/supabase/types'
import type { CardSize } from '@/lib/dashboard/types'

// List-scroll height by card size: small shows ~4 clients, medium more, large is
// the original tall panel. The list scrolls in every size.
const LIST_MAX: Record<CardSize, string> = {
  compact: 'max-h-[14rem]',
  standard: 'max-h-[20rem]',
  expanded: 'max-h-[28rem]',
}

/**
 * The client roster, surfaced as a homepage column (it used to live only on its
 * own page). A searchable, scrollable list that links straight into each
 * client's workspace; full add/import management still lives on /clients.
 */
export function RosterPanel({
  clients,
  loading,
  error,
  size = 'expanded',
}: {
  clients: Client[]
  loading: boolean
  error: string
  size?: CardSize
}) {
  const [filter, setFilter] = useState('')

  // Archived clients (the permanent record) never surface on the dashboard —
  // they live only on the roster's Archived tab.
  const visible = clients.filter((c) => {
    if (c.status === 'archived') return false
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q)
    )
  })

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Clients</p>
        <Link href="/clients" className="text-[12px] font-medium text-tlw-signal-orange hover:underline">
          Manage →
        </Link>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search clients…"
        className="mb-3 w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none transition-colors focus:border-tlw-signal-orange"
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-6 text-center text-[13px] text-tlw-espresso">
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[13px] text-tlw-warm-gray">
            {clients.length === 0 ? 'No clients yet.' : 'No matches.'}
          </p>
          {clients.length === 0 && (
            <Link href="/clients" className="mt-2 text-[13px] font-medium text-tlw-signal-orange hover:underline">
              Add a client →
            </Link>
          )}
        </div>
      ) : (
        <div className={`${LIST_MAX[size]} space-y-2 overflow-y-auto pr-1`}>
          {visible.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="group block rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5 transition-all duration-tlw-base hover:-translate-y-0.5 hover:border-tlw-warm-gray/30 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{c.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">
                    {[c.title, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                    c.status === 'active'
                      ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                      : 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
                  }`}
                >
                  {c.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
