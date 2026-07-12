'use client'
import { useCallback, useEffect, useState } from 'react'
import { NudgeItem, type NudgeRow } from './NudgeItem'
import { CreateNudgeButton } from './CreateNudgeButton'

/**
 * The coach's cross-client Nudge Queue — every pending nudge in one place. Drafts
 * first (need review), then scheduled/snoozed, then a Sent panel (the recent
 * outbound record). Each item is self-contained; acting on one refetches the list
 * so it falls away once handled. "+ Create nudge" writes a manual draft for any
 * working client.
 */
export function NudgeQueue() {
  const [rows, setRows] = useState<NudgeRow[]>([])
  const [sent, setSent] = useState<NudgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // A nudge id to scroll to + briefly highlight, from a ?focus= deep link
  // (e.g. the dashboard "Suggested nudges" card).
  const [focusId, setFocusId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nudges')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load nudges')
      setRows(data.nudges || [])
      setSent(data.sent || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    try {
      const focus = new URLSearchParams(window.location.search).get('focus')
      if (focus) setFocusId(focus)
    } catch {
      /* ignore */
    }
  }, [load])

  // Once the list is loaded, bring the focused nudge into view and fade its
  // highlight out after a moment.
  useEffect(() => {
    if (loading || !focusId) return
    const el = document.getElementById(`nudge-${focusId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFocusId(null), 2400)
    return () => clearTimeout(t)
  }, [loading, focusId])

  if (loading) {
    return <div className="h-40 animate-pulse rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
  }
  if (error) {
    return (
      <div className="rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-surface p-8 text-center text-[13px] text-tlw-espresso">
        {error}
      </div>
    )
  }

  const drafts = rows.filter((n) => n.status === 'draft')
  const queued = rows.filter((n) => n.status === 'scheduled' || n.status === 'snoozed')

  const focusRing = (id: string) =>
    focusId === id
      ? 'rounded-tlw-lg ring-2 ring-tlw-signal-orange ring-offset-2 ring-offset-tlw-canvas transition-shadow'
      : ''

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <CreateNudgeButton onCreated={load} />
      </div>

      {rows.length === 0 && (
        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-8 text-center">
          <p className="text-[14px] text-tlw-espresso">No nudges to review.</p>
          <p className="mt-1 text-[13px] text-tlw-warm-gray">
            New drafts appear here automatically after a session is scored — or press “Create nudge.”
          </p>
        </div>
      )}

      {drafts.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Needs review · {drafts.length}
          </p>
          <div className="space-y-3">
            {drafts.map((n) => (
              <div key={n.id} id={`nudge-${n.id}`} className={focusRing(n.id)}>
                <NudgeItem nudge={n} showClient onChanged={load} />
              </div>
            ))}
          </div>
        </section>
      )}

      {queued.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Scheduled · {queued.length}
          </p>
          <div className="space-y-3">
            {queued.map((n) => (
              <div key={n.id} id={`nudge-${n.id}`} className={focusRing(n.id)}>
                <NudgeItem nudge={n} showClient onChanged={load} />
              </div>
            ))}
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            Sent · {sent.length}
          </p>
          <div className="space-y-2">
            {sent.map((n) => (
              <SentNudgeRow key={n.id} nudge={n} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
  goals: 'Goals',
  reengagement: 'Re-engagement',
}

function sentLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** One sent nudge — a compact log row; click to expand the message that went out. */
function SentNudgeRow({ nudge }: { nudge: NudgeRow }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <span className="shrink-0 rounded-full bg-tlw-navy-rich/10 px-2 py-[2px] text-[11px] font-medium text-tlw-navy-rich">
          {TYPE_LABEL[nudge.type] || nudge.type}
        </span>
        <span className="shrink-0 text-[12px] font-medium text-tlw-espresso">{nudge.client_name}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-tlw-warm-gray">
          {nudge.draft_subject || nudge.draft_body || ''}
        </span>
        {nudge.pdf_name && <span className="shrink-0 text-[11px] text-tlw-warm-gray">📎</span>}
        <span className="shrink-0 text-[11px] text-tlw-warm-gray">{sentLabel(nudge.sent_at)}</span>
        <span className="shrink-0 text-[11px] text-tlw-warm-gray">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-tlw-warm-gray/10 px-4 py-3">
          {nudge.draft_subject && (
            <p className="mb-1 text-[13px] font-medium text-tlw-espresso">{nudge.draft_subject}</p>
          )}
          <p className="whitespace-pre-wrap text-[13px] text-tlw-espresso">{nudge.draft_body}</p>
          {nudge.pdf_name && (
            <p className="mt-2 text-[12px] text-tlw-warm-gray">📎 {nudge.pdf_name}</p>
          )}
        </div>
      )}
    </div>
  )
}
