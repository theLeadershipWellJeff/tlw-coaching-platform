'use client'
import { useState } from 'react'

export interface NudgeRow {
  id: string
  client_id?: string
  client_name?: string
  type: string
  origin: string
  status: string
  trigger_excerpt: string | null
  rationale: string | null
  draft_subject: string | null
  draft_body: string | null
  scheduled_for: string | null
  sent_at?: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, string> = {
  action_checkin: 'Action check-in',
  insight: 'Insight',
  framework: 'Framework',
  reengagement: 'Re-engagement',
}

// Map an ISO timestamp to a value a <input type="datetime-local"> accepts (local
// wall time, no seconds/zone).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function whenLabel(iso: string | null): string {
  if (!iso) return 'No send time set'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * One reviewable nudge: the AI draft (editable), why it was proposed, and the
 * review actions. Every path PATCHes /api/nudges/[id]; the parent refetches via
 * onChanged. Nothing sends without the coach pressing Send or Schedule.
 */
export function NudgeItem({
  nudge,
  showClient = false,
  onChanged,
}: {
  nudge: NudgeRow
  showClient?: boolean
  onChanged: () => void
}) {
  const [subject, setSubject] = useState(nudge.draft_subject || '')
  const [bodyText, setBodyText] = useState(nudge.draft_body || '')
  const [when, setWhen] = useState(toLocalInput(nudge.scheduled_for))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dirty =
    subject !== (nudge.draft_subject || '') ||
    bodyText !== (nudge.draft_body || '') ||
    when !== toLocalInput(nudge.scheduled_for)

  async function patch(payload: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/nudges/${nudge.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Bundle any unsaved edits into the action call so it acts on the latest text.
  function edits(): Record<string, unknown> {
    const whenIso = when ? new Date(when).toISOString() : null
    return { draft_subject: subject, draft_body: bodyText, scheduled_for: whenIso }
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas/40 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-tlw-navy-rich/10 px-2 py-[2px] text-[11px] font-medium text-tlw-navy-rich">
          {TYPE_LABEL[nudge.type] || nudge.type}
        </span>
        {showClient && nudge.client_name && (
          <span className="text-[12px] font-medium text-tlw-espresso">{nudge.client_name}</span>
        )}
        {nudge.status === 'scheduled' && (
          <span className="rounded-full bg-tlw-warm-gray/15 px-2 py-[2px] text-[11px] text-tlw-warm-gray">
            Scheduled · {whenLabel(nudge.scheduled_for)}
          </span>
        )}
        {nudge.status === 'snoozed' && (
          <span className="rounded-full bg-tlw-warm-gray/15 px-2 py-[2px] text-[11px] text-tlw-warm-gray">
            Snoozed
          </span>
        )}
        {nudge.status === 'sent' && (
          <span className="rounded-full bg-tlw-warm-gray/15 px-2 py-[2px] text-[11px] text-tlw-warm-gray">
            Sent
          </span>
        )}
      </div>

      {nudge.rationale && (
        <p className="mb-2 text-[12px] italic text-tlw-warm-gray">Why: {nudge.rationale}</p>
      )}
      {nudge.trigger_excerpt && (
        <p className="mb-3 border-l-2 border-tlw-warm-gray/30 pl-2 text-[12px] text-tlw-warm-gray">
          {nudge.trigger_excerpt}
        </p>
      )}

      {nudge.status === 'sent' ? (
        <div className="space-y-1">
          {subject && <p className="text-[13px] font-medium text-tlw-espresso">{subject}</p>}
          <p className="whitespace-pre-wrap text-[13px] text-tlw-espresso">{bodyText}</p>
        </div>
      ) : (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="mb-2 w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-1.5 text-[13px] text-tlw-espresso focus:border-tlw-navy-rich focus:outline-none"
          />
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={5}
            placeholder="Message"
            className="mb-2 w-full resize-y rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] leading-relaxed text-tlw-espresso focus:border-tlw-navy-rich focus:outline-none"
          />

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-tlw-warm-gray">Send time</label>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1 text-[12px] text-tlw-espresso focus:border-tlw-navy-rich focus:outline-none"
            />
            {dirty && (
              <button
                onClick={() => patch(edits())}
                disabled={busy}
                className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-50"
              >
                Save edits
              </button>
            )}
          </div>

          {error && <p className="mb-2 text-[12px] text-[#9b3b3b]">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => patch({ ...edits(), action: 'send' })}
              disabled={busy}
              className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Send now
            </button>
            <button
              onClick={() => patch({ ...edits(), action: 'schedule' })}
              disabled={busy}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-50"
            >
              Schedule
            </button>
            <button
              onClick={() => patch({ action: 'snooze' })}
              disabled={busy}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-50"
            >
              Snooze
            </button>
            <button
              onClick={() => patch({ action: 'skip' })}
              disabled={busy}
              className="rounded-tlw-lg px-3 py-1.5 text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  )
}
