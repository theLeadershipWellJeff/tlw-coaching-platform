'use client'
/**
 * Send session note — the Phase 3 send flow + close-out.
 *
 *   tap "Send to client" → (no note text AND no transcript → blank compose,
 *   Claude never invents a session) → narrative STREAMS in, cached on the note
 *   the moment it finishes → coach reviews/edits in a plain textarea (brand
 *   type, no rich editor — prose, and it fights the mobile keyboard) → edits
 *   autosave to the draft → final Send → the server claims the note, sends,
 *   awaits success, logs, closes out → ONLY THEN this modal reports success.
 *
 * Failure leaves the modal open with the error and nothing marked sent. Never
 * closes optimistically. The final send button is navy; the 2px Signal Orange
 * top border on the footer marks the irreversible moment (one orange instance,
 * the accent rule intact).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { Modal } from '@/app/components/shared/Modal'
import { defaultSubject, splitNarrative } from '@/lib/notes/narrative-format'

type Phase = 'checking' | 'generating' | 'review' | 'blank' | 'sending'

export function SendNoteFlow({
  client,
  noteId,
  actions,
  insights,
  onClose,
  onSent,
}: {
  client: Client
  noteId: string
  actions: string[]
  insights: string[]
  onClose: () => void
  /** Fired ONLY after the server confirms the send + close-out. */
  onSent: (result: { sentAt: string; communicationId: string | null }) => void
}) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [sourceNote, setSourceNote] = useState('')
  const [cached, setCached] = useState(false)
  const firstName = client.name.split(' ')[0] || 'there'
  const base = `/api/clients/${client.id}/notes/${noteId}/narrative`
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendingRef = useRef(false)

  // ---- generation (streamed; cached copy served as one chunk) ----------------
  const generate = useCallback(
    async (force: boolean) => {
      setPhase('generating')
      setError('')
      setSourceNote('')
      setCached(false)
      try {
        const res = await fetch(`${base}${force ? '?force=1' : ''}`, { method: 'POST' })
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}))
          if (data.reason === 'no_source') {
            setSubject((s) => s || defaultSubject(firstName))
            setBody('')
            setPhase('blank')
            return
          }
          throw new Error(data.error || 'Could not draft the message.')
        }
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Could not draft the message.')
        }
        const isCached = res.headers.get('X-Narrative-Cached') === '1'
        const src = res.headers.get('X-Narrative-Source')
        setCached(isCached)
        if (src === 'transcript') setSourceNote('Drafted from the session transcript — there is no coach note for this session.')
        else if (src === 'note+transcript') setSourceNote('Drafted from your note, with the transcript as backup.')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let full = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          full += decoder.decode(value, { stream: true })
          const { subject: s, body: b } = splitNarrative(full)
          setSubject(s)
          setBody(b)
        }
        const { subject: s, body: b } = splitNarrative(full)
        if (!b.trim()) throw new Error('The draft came back empty — try redrafting, or write it yourself.')
        setSubject(s || defaultSubject(firstName))
        setBody(b)
        setPhase('review')
      } catch (e: any) {
        setError(e.message || 'Could not draft the message.')
        setSubject((s) => s || defaultSubject(firstName))
        setPhase('blank')
      }
    },
    [base, firstName]
  )

  useEffect(() => {
    generate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- autosave the coach's edits to the draft (debounced; flush on close) ---
  const flush = useCallback(() => {
    if (!dirty.current) return
    dirty.current = false
    try {
      fetch(base, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
        keepalive: true,
      }).catch(() => {})
    } catch {}
  }, [base, subject, body])

  useEffect(() => {
    if (!dirty.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 800)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [subject, body, flush])

  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      flush()
    }
  }, [flush])

  function edit(setter: (v: string) => void) {
    return (v: string) => {
      dirty.current = true
      setter(v)
    }
  }

  // ---- the irreversible moment -----------------------------------------------
  async function send() {
    if (sendingRef.current) return // double-tap guard (the server claim is the real one)
    sendingRef.current = true
    setPhase('sending')
    setError('')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    dirty.current = false
    try {
      const res = await fetch(`/api/clients/${client.id}/notes/${noteId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), actions, insights }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The send failed. Nothing was sent.')
      onSent({ sentAt: data.sentAt, communicationId: data.communicationId ?? null })
    } catch (e: any) {
      setError(e.message || 'The send failed. Nothing was sent.')
      setPhase(body.trim() ? 'review' : 'blank')
      sendingRef.current = false
    }
  }

  const busy = phase === 'checking' || phase === 'generating' || phase === 'sending'
  const canSend = phase !== 'sending' && phase !== 'checking' && phase !== 'generating' && !!subject.trim() && !!body.trim()

  return (
    <Modal title={`Send session note to ${client.name}`} onClose={busy && phase === 'sending' ? () => {} : onClose} width="max-w-xl">
      <div className="space-y-3">
        <div className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
          To <span className="text-tlw-espresso">{client.email}</span> · Cc you
        </div>

        {phase === 'blank' && !error && (
          <div className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas/60 p-3 text-[12px] text-tlw-espresso">
            There is no session note and no transcript for this session, so nothing was drafted for you. Write the message yourself below.
          </div>
        )}
        {sourceNote && phase === 'review' && <p className="text-[11px] text-tlw-warm-gray">{sourceNote}</p>}
        {cached && phase === 'review' && <p className="text-[11px] text-tlw-warm-gray">Showing your saved draft — it is not regenerated on reopen. Use ↻ to redraft.</p>}

        <input
          value={subject}
          onChange={(e) => edit(setSubject)(e.target.value)}
          disabled={busy}
          placeholder="Subject"
          className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange disabled:opacity-70"
        />
        <textarea
          value={body}
          onChange={(e) => edit(setBody)(e.target.value)}
          disabled={phase === 'sending' || phase === 'checking'}
          readOnly={phase === 'generating'}
          rows={12}
          placeholder={phase === 'generating' ? 'Drafting…' : 'Your message to the client…'}
          className="min-h-[220px] w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 font-sans text-[14px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange disabled:opacity-70"
        />
        {phase === 'generating' && <p className="text-[12px] text-tlw-warm-gray">Drafting from your session material…</p>}

        {insights.length > 0 && (
          <div className="rounded-tlw-md border border-tlw-warm-gray/15 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">Insights (added below the message)</p>
            <ul className="space-y-1">
              {insights.map((t, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-tlw-espresso">
                  <span className="text-tlw-warm-gray">✦</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {actions.length > 0 && (
          <div className="rounded-tlw-md border border-tlw-warm-gray/15 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Action items (checklist the client can tap)</p>
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

        {error && (
          <p role="alert" className="rounded-tlw-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            {error}
          </p>
        )}

        {/* The irreversible moment: 2px Signal Orange top border, navy button. */}
        <div className="-mx-1 flex flex-col gap-2 border-t-2 border-tlw-signal-orange px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {phase !== 'generating' && phase !== 'sending' && (
              <button onClick={() => generate(true)} className="text-[12px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
                ↻ redraft
              </button>
            )}
            <p className="text-[11px] text-tlw-warm-gray">Sends once. The message becomes read-only after it goes.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <button
              onClick={onClose}
              disabled={phase === 'sending'}
              className="min-h-[40px] rounded-tlw-lg border border-tlw-warm-gray/30 px-4 text-[13px] font-medium text-tlw-espresso disabled:opacity-40 sm:border-0 sm:px-0 sm:text-tlw-warm-gray"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={!canSend}
              className="min-h-[40px] rounded-tlw-lg bg-tlw-navy-rich px-4 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {phase === 'sending' ? 'Sending…' : `Send to ${firstName}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
