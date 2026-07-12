'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { HistoryItem } from '@/app/api/clients/[id]/history/route'

/** "2 days ago" relative time, falling back to a short date for older items. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function itemTimestamp(item: HistoryItem): string {
  if (item.kind === 'communication') return item.sent_at
  if (item.kind === 'nudge') return item.sent_at
  return item.created_at
}

type RowProps = { item: HistoryItem; clientId: string }

function HistoryRow({ item, clientId }: RowProps) {
  if (item.kind === 'note') {
    return (
      <li className="flex items-start gap-3">
        <span className="mt-[1px] text-[14px] leading-none text-tlw-warm-gray" aria-hidden>📝</span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/clients/${clientId}/notes`}
            className="truncate text-[13px] text-tlw-espresso hover:underline"
          >
            {item.title || 'Session note'}
          </Link>
          {item.session_date && (
            <p className="text-[12px] text-tlw-warm-gray">
              {new Date(item.session_date + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </p>
          )}
        </div>
        <span className="mt-[1px] shrink-0 text-[11px] text-tlw-warm-gray">{relTime(item.created_at)}</span>
      </li>
    )
  }

  if (item.kind === 'communication') {
    const ICONS: Record<string, string> = { email: '✉', reminder: '🔔', prep_sheet: '📄' }
    const label = item.subject?.trim() || (item.type === 'reminder' ? 'Reminder' : item.type === 'prep_sheet' ? 'Prep sheet' : 'Email')
    return (
      <li className="flex items-start gap-3">
        <span className="mt-[1px] text-[14px] leading-none text-tlw-warm-gray" aria-hidden>
          {ICONS[item.type] || '✉'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] text-tlw-espresso">{label}</p>
            {item.status === 'failed' && (
              <span
                className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                style={{ backgroundColor: 'rgba(180,60,60,0.10)', color: '#9b3b3b' }}
              >
                failed
              </span>
            )}
          </div>
          {item.preview && <p className="truncate text-[12px] text-tlw-warm-gray">{item.preview}</p>}
        </div>
        <span className="mt-[1px] shrink-0 text-[11px] text-tlw-warm-gray">{relTime(item.sent_at)}</span>
      </li>
    )
  }

  if (item.kind === 'nudge') {
    const NUDGE_LABELS: Record<string, string> = {
      action_checkin: 'Action check-in',
      insight: 'Insight nudge',
      framework: 'Framework nudge',
      goals: 'Goals nudge',
      reengagement: 'Re-engagement',
    }
    return (
      <li className="flex items-start gap-3">
        <span className="mt-[1px] text-[14px] leading-none text-tlw-warm-gray" aria-hidden>💬</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-tlw-espresso">
            {item.subject?.trim() || NUDGE_LABELS[item.nudge_type] || 'Nudge'}
          </p>
          <p className="text-[12px] text-tlw-warm-gray">{NUDGE_LABELS[item.nudge_type] || 'Between-session nudge'}</p>
        </div>
        <span className="mt-[1px] shrink-0 text-[11px] text-tlw-warm-gray">{relTime(item.sent_at)}</span>
      </li>
    )
  }

  if (item.kind === 'report') {
    const bandLabel = item.band
      ? item.band.charAt(0).toUpperCase() + item.band.slice(1)
      : null
    return (
      <li className="flex items-start gap-3">
        <span className="mt-[1px] text-[14px] leading-none text-tlw-warm-gray" aria-hidden>📊</span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/practice/${item.id}`}
            className="truncate text-[13px] text-tlw-espresso hover:underline"
          >
            Session scored
            {item.session_date
              ? ` — ${new Date(item.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : ''}
          </Link>
          {(item.overall_score !== null || bandLabel) && (
            <p className="text-[12px] text-tlw-warm-gray">
              {item.overall_score !== null ? `Overall ${item.overall_score.toFixed(1)}` : ''}
              {item.overall_score !== null && bandLabel ? ' · ' : ''}
              {bandLabel || ''}
            </p>
          )}
        </div>
        <span className="mt-[1px] shrink-0 text-[11px] text-tlw-warm-gray">{relTime(item.created_at)}</span>
      </li>
    )
  }

  return null
}

const PAGE_SIZE = 8

export function ClientHistoryCard({
  clientId,
  reloadKey = 0,
}: {
  clientId: string
  reloadKey?: number
}) {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/history`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => !cancelled && setItems(d.history || []))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [clientId, reloadKey])

  const visible = showAll ? items : items.slice(0, PAGE_SIZE)

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Client History</p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">
          No history yet — notes, emails, nudges, and scored sessions will appear here.
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {visible.map((item) => (
              <HistoryRow key={`${item.kind}-${item.id}`} item={item} clientId={clientId} />
            ))}
          </ul>

          {items.length > PAGE_SIZE && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
            >
              {showAll ? 'Show less' : `Show all (${items.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
