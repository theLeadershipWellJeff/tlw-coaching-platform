'use client'
import { useState } from 'react'

export interface PrepSheetRow {
  id: string
  client_id: string
  client_name?: string
  appointment_id: string
  status: string // draft | approved | sent | skipped | failed
  subject: string | null
  body_html: string | null
  scheduled_send_at: string | null
  approved_at: string | null
  sent_at: string | null
  skipped_at: string | null
  skip_reason: string | null
  error_detail: string | null
  generated_at: string | null
  generation_model: string | null
  created_at: string
  session_at?: string | null
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Needs review', cls: 'bg-tlw-warm-gray/15 text-tlw-espresso' },
  approved: { label: 'Scheduled', cls: 'bg-tlw-navy-rich/10 text-tlw-navy-rich' },
  sent: { label: 'Sent', cls: 'bg-emerald-500/12 text-emerald-700' },
  skipped: { label: 'Skipped', cls: 'bg-tlw-warm-gray/12 text-tlw-warm-gray' },
  failed: { label: 'Failed', cls: 'bg-tlw-signal-orange/12 text-tlw-signal-orange' },
}

function fmt(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

/**
 * One prep-sheet row in the queue / workspace card. Renders the sheet exactly as
 * it will send (sandboxed iframe), and the coach's actions by status. The editor
 * is a raw-HTML textarea + live preview rather than a rich-text component: the
 * body is a complete styled email (inline-table layout) that a TipTap round-trip
 * would corrupt — so we edit the HTML directly and preview it live.
 */
export function PrepSheetItem({
  sheet,
  showClient = false,
  onChanged,
}: {
  sheet: PrepSheetRow
  showClient?: boolean
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(sheet.subject || '')
  const [bodyHtml, setBodyHtml] = useState(sheet.body_html || '')
  const [skipping, setSkipping] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pill = STATUS_PILL[sheet.status] || STATUS_PILL.draft
  const terminal = sheet.status === 'sent' || sheet.status === 'skipped'

  async function patch(payload: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/prep-sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      setEditing(false)
      setSkipping(false)
      onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdits = () => patch({ subject, body_html: bodyHtml })
  const approve = () => patch({ action: 'approve' })
  const sendNow = () => patch({ action: 'send' })
  const regenerate = () => patch({ action: 'regenerate' })
  const confirmSkip = () => {
    if (!skipReason.trim()) {
      setError('Add a reason before skipping.')
      return
    }
    patch({ action: 'skip', skip_reason_note: skipReason.trim() })
  }

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className={`shrink-0 rounded-full px-2 py-[2px] text-[11px] font-medium ${pill.cls}`}>{pill.label}</span>
        {showClient && <span className="text-[13px] font-semibold text-tlw-navy-deep">{sheet.client_name}</span>}
        <span className="text-[12px] text-tlw-warm-gray">Session · {fmt(sheet.session_at)}</span>
        {sheet.status !== 'sent' && sheet.status !== 'skipped' && (
          <span className="text-[12px] text-tlw-navy-rich">Delivers · {fmt(sheet.scheduled_send_at)}</span>
        )}
        {sheet.status === 'sent' && (
          <span className="text-[12px] text-emerald-700">Sent · {fmt(sheet.sent_at)}</span>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto shrink-0 text-[12px] font-medium text-tlw-signal-orange hover:underline"
        >
          {expanded ? 'Hide' : 'View'}
        </button>
      </div>

      {/* Failure / skip note */}
      {sheet.status === 'failed' && sheet.error_detail && (
        <p className="px-4 pb-2 text-[12px] text-tlw-signal-orange">Couldn’t generate: {sheet.error_detail}</p>
      )}
      {sheet.status === 'skipped' && sheet.error_detail && (
        <p className="px-4 pb-2 text-[12px] text-tlw-warm-gray">Skipped: {sheet.error_detail}</p>
      )}

      {expanded && (
        <div className="border-t border-tlw-warm-gray/10 px-4 py-3">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
                  Subject
                </label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
                  Email HTML
                </label>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  rows={10}
                  spellCheck={false}
                  className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 font-mono text-[12px]"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">Live preview</p>
                <iframe title="Prep sheet preview" sandbox="" srcDoc={bodyHtml} className="h-[420px] w-full rounded-tlw-md border border-tlw-warm-gray/15 bg-white" />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveEdits} disabled={busy} className="rounded-tlw-md bg-tlw-navy-rich px-4 py-2 text-[13px] font-semibold text-tlw-cream disabled:opacity-60">
                  Save
                </button>
                <button onClick={() => { setEditing(false); setSubject(sheet.subject || ''); setBodyHtml(sheet.body_html || '') }} className="text-[13px] text-tlw-warm-gray hover:underline">
                  Cancel
                </button>
                {sheet.status === 'approved' && (
                  <span className="text-[12px] text-tlw-warm-gray">Saving an edit returns this to “Needs review”.</span>
                )}
              </div>
            </div>
          ) : (
            <iframe title="Prep sheet" sandbox="" srcDoc={sheet.body_html || ''} className="h-[520px] w-full rounded-tlw-md border border-tlw-warm-gray/15 bg-white" />
          )}
        </div>
      )}

      {/* Skip reason inline */}
      {skipping && (
        <div className="border-t border-tlw-warm-gray/10 px-4 py-3">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-[1.5px] text-tlw-warm-gray">
            Why skip this one?
          </label>
          <input
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            placeholder="e.g. sending a custom note instead"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-white px-3 py-2 text-[13px]"
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={confirmSkip} disabled={busy} className="rounded-tlw-md bg-tlw-warm-gray/20 px-4 py-2 text-[13px] font-semibold text-tlw-espresso disabled:opacity-60">
              Confirm skip
            </button>
            <button onClick={() => { setSkipping(false); setError('') }} className="text-[13px] text-tlw-warm-gray hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!terminal && !editing && !skipping && (
        <div className="flex flex-wrap items-center gap-2 border-t border-tlw-warm-gray/10 px-4 py-2.5">
          {sheet.status === 'draft' && (
            <button onClick={approve} disabled={busy} className="rounded-tlw-md bg-tlw-navy-rich px-3.5 py-1.5 text-[12px] font-semibold text-tlw-cream disabled:opacity-60">
              Approve
            </button>
          )}
          <button onClick={sendNow} disabled={busy} className="rounded-tlw-md border border-tlw-navy-rich/40 px-3.5 py-1.5 text-[12px] font-semibold text-tlw-navy-rich disabled:opacity-60">
            Send now
          </button>
          <button onClick={() => { setExpanded(true); setEditing(true) }} disabled={busy} className="rounded-tlw-md border border-tlw-warm-gray/30 px-3.5 py-1.5 text-[12px] text-tlw-espresso disabled:opacity-60">
            Edit
          </button>
          <button onClick={regenerate} disabled={busy} className="rounded-tlw-md border border-tlw-warm-gray/30 px-3.5 py-1.5 text-[12px] text-tlw-espresso disabled:opacity-60">
            Regenerate
          </button>
          <button onClick={() => setSkipping(true)} disabled={busy} className="ml-auto text-[12px] text-tlw-warm-gray hover:underline">
            Skip
          </button>
        </div>
      )}

      {error && <p className="px-4 pb-2.5 text-[12px] text-tlw-signal-orange">{error}</p>}
    </div>
  )
}
