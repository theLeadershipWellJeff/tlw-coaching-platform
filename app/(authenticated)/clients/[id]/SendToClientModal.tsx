'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { Modal } from '@/app/components/shared/Modal'

/**
 * Drafts a clean, client-facing email from the current note (via Claude), shows
 * it for review/edit, then sends it to the client. Only the note is used — never
 * the coach's private Key info.
 */
export function SendToClientModal({
  client,
  noteTitle,
  noteHtml,
  onClose,
}: {
  client: Client
  noteTitle: string
  noteHtml: string
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
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: client.email, subject, body: bodyText }),
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
                rows={14}
                placeholder="The cleaned-up message…"
                className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
              <p className="text-[11px] text-tlw-warm-gray">
                Review and edit before sending — this is a draft cleaned up from your note.
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
