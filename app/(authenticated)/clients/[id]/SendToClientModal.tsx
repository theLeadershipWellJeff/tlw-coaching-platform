'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { Modal } from '@/app/components/shared/Modal'

/**
 * Drafts a clean, client-facing email from the current note (via Claude), shows
 * it for review/edit, then sends it. The captured INSIGHT: items render as an
 * Insights list and the ACTION: items as an interactive checklist the client can
 * tap to mark done (logged back to their account). Only the note is used — never
 * the coach's private Key info.
 */
export function SendToClientModal({
  client,
  noteTitle,
  noteHtml,
  noteId,
  actions,
  insights,
  onClose,
}: {
  client: Client
  noteTitle: string
  noteHtml: string
  noteId: string
  actions: string[]
  insights: string[]
  onClose: () => void
}) {
  const [drafting, setDrafting] = useState(true)
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const draft = useCallback(async () => {
    setDrafting(true)
    setError('')
    try {
      const res = await fetch('/api/notes/client-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteHtml, clientName: client.name, noteTitle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not draft the email.')
      setSubject(data.subject)
      setBodyText(data.body)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDrafting(false)
    }
  }, [noteHtml, client.name, noteTitle])

  useEffect(() => {
    draft()
  }, [draft])

  async function send() {
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${client.id}/send-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body: bodyText, actions, insights, noteId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send.')
      setSent(true)
      setTimeout(onClose, 1000)
    } catch (e: any) {
      setError(e.message)
      setSending(false)
    }
  }

  return (
    <Modal title={`Send to ${client.name}`} onClose={onClose} width="max-w-xl">
      {sent ? (
        <p className="py-6 text-center text-[14px] font-medium" style={{ color: 'var(--color-success)' }}>
          Sent ✓
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            To <span className="text-tlw-espresso">{client.email}</span> · Cc you
          </div>

          {drafting ? (
            <div className="space-y-2">
              <div className="h-9 animate-pulse rounded-tlw-md bg-tlw-canvas" />
              <div className="h-40 animate-pulse rounded-tlw-md bg-tlw-canvas" />
              <p className="text-[12px] text-tlw-warm-gray">Cleaning up your note into an email…</p>
            </div>
          ) : (
            <>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={10}
                placeholder="The cleaned-up message…"
                className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />

              {insights.length > 0 && (
                <div className="rounded-tlw-md border border-tlw-warm-gray/15 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-signal-orange">Insights</p>
                  <ul className="space-y-1">
                    {insights.map((t, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-tlw-espresso">
                        <span className="text-tlw-signal-orange">✦</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {actions.length > 0 && (
                <div className="rounded-tlw-md border border-tlw-warm-gray/15 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Action items</p>
                  <p className="mb-2 text-[11px] text-tlw-warm-gray">Each becomes a checkbox the client can tap to mark done.</p>
                  <ul className="space-y-1.5">
                    {actions.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-tlw-espresso">
                        <span className="mt-[2px] inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border-2 border-tlw-navy-rich" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-tlw-warm-gray">
                Review and edit the message before sending. Insights and action items are pulled from your note.
              </p>
            </>
          )}

          {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}

          <div className="flex items-center justify-between gap-3">
            {!drafting && (
              <button onClick={draft} disabled={sending} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-40">
                ↻ redraft
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={drafting || sending || !subject.trim() || !bodyText.trim()}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {sending ? 'Sending…' : `Send to ${client.name.split(' ')[0]}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
