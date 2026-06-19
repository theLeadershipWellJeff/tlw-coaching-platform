'use client'
import { useEffect, useState } from 'react'

interface CommRow {
  id: string
  type: string
  direction: string
  subject: string | null
  preview: string | null
  status: string
  sent_at: string
}

/** "2 days ago" style relative time, falling back to a date for older items. */
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

const ICONS: Record<string, string> = { email: '✉', reminder: '🔔', prep_sheet: '📄' }

function labelFor(c: CommRow): string {
  if (c.subject && c.subject.trim()) return c.subject
  if (c.type === 'reminder') return 'Reminder'
  if (c.type === 'prep_sheet') return 'Prep sheet'
  return 'Email'
}

/**
 * Recent Communication — the visible proof of the communications log. Shows the
 * latest sends (and, once they ship, reminders) for this client. Failures show a
 * muted-red chip so a bad send is never silent.
 */
export function CommunicationCard({ clientId, reloadKey = 0 }: { clientId: string; reloadKey?: number }) {
  const [rows, setRows] = useState<CommRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/communications`)
      .then((r) => (r.ok ? r.json() : { communications: [] }))
      .then((d) => !cancelled && setRows(d.communications || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey])

  const visible = showAll ? rows : rows.slice(0, 5)

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Recent Communication</p>

      {loading ? (
        <div className="h-12 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">
          No communication yet — send your first email from Compose above.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {visible.map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <span className="mt-[1px] text-[14px] leading-none text-tlw-warm-gray" aria-hidden>
                  {ICONS[c.type] || '✉'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] text-tlw-espresso">{labelFor(c)}</p>
                    {c.status === 'failed' && (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-medium"
                        style={{ backgroundColor: 'rgba(180,60,60,0.10)', color: '#9b3b3b' }}
                      >
                        failed
                      </span>
                    )}
                  </div>
                  {c.preview && <p className="truncate text-[12px] text-tlw-warm-gray">{c.preview}</p>}
                </div>
                <span className="mt-[1px] shrink-0 text-[11px] text-tlw-warm-gray">{relTime(c.sent_at)}</span>
              </li>
            ))}
          </ul>

          {rows.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso"
            >
              {showAll ? 'Show less' : `View all (${rows.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
