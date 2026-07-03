'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD_META } from '@/lib/dashboard/cards'
import { useCoachTimezone } from '@/lib/dashboard/useCoachTimezone'
import type { DashboardCard } from '@/lib/dashboard/types'

type Actor = 'coach' | 'system'
type Filter = 'all' | 'coach' | 'system'

interface AccomplishedItem {
  id: string
  type: string
  actor: Actor
  label: string
  client_name: string | null
  timestamp: string
}

const TYPE_ICON: Record<string, string> = {
  email_sent: '✉',
  nudge_sent: '💬',
  reminder_sent: '🔔',
  transcript_ingested: '📄',
  report_scored: '📊',
}

const FILTER_LABELS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'coach', label: 'My actions' },
  { value: 'system', label: 'System only' },
]

function relativeTime(iso: string, timeZone: string) {
  try {
    const d = new Date(iso)
    const diff = Math.round((Date.now() - d.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    if (diff < 24 * 60) return `${Math.round(diff / 60)}h ago`
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  } catch {
    return ''
  }
}

function AccomplishedTodayBody() {
  const timeZone = useCoachTimezone()
  const [items, setItems] = useState<AccomplishedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/accomplished')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch {
      // fail silently
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = items.filter((i) => filter === 'all' || i.actor === filter)

  return (
    <div>
      {/* Toggle */}
      <div className="mb-4 flex gap-1 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60 p-1">
        {FILTER_LABELS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors duration-tlw-base ${
              filter === value
                ? 'bg-tlw-navy-deep text-white shadow-sm'
                : 'text-tlw-warm-gray hover:text-tlw-espresso'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[100px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 text-center">
          <p className="text-[13px] text-tlw-warm-gray">
            {filter === 'coach'
              ? 'No coach actions in the past 24 hours.'
              : filter === 'system'
                ? 'No automated actions in the past 24 hours.'
                : 'Nothing recorded in the past 24 hours yet.'}
          </p>
        </div>
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {visible.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3.5"
            >
              {/* Icon */}
              <span className="mt-0.5 shrink-0 text-[16px] leading-none" aria-hidden>
                {TYPE_ICON[item.type] || '•'}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-tlw-navy-deep">{item.label}</p>
                {item.client_name && (
                  <p className="mt-0.5 truncate text-[12px] text-tlw-warm-gray">{item.client_name}</p>
                )}
              </div>

              {/* Meta */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-tlw-warm-gray">{relativeTime(item.timestamp, timeZone)}</span>
                <span
                  className={`rounded-full px-2 py-[1px] text-[10px] font-medium ${
                    item.actor === 'system'
                      ? 'bg-tlw-warm-gray/15 text-tlw-warm-gray'
                      : 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                  }`}
                >
                  {item.actor === 'system' ? 'auto' : 'you'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer count */}
      {!loading && visible.length > 0 && (
        <p className="mt-3 text-center text-[11px] text-tlw-warm-gray">
          {visible.length} action{visible.length !== 1 ? 's' : ''} in the past 24 hours
          {filter !== 'all' && ` · showing ${filter === 'coach' ? 'yours only' : 'system only'}`}
        </p>
      )}
    </div>
  )
}

export const accomplishedTodayCard: DashboardCard<null> = {
  ...CARD_META['accomplished-today'],
  useData: () => null,
  render: () => <AccomplishedTodayBody />,
}
