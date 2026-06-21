'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'

type NudgeType = 'action_checkin' | 'insight' | 'framework'

const TYPES: { value: NudgeType; label: string; blurb: string }[] = [
  { value: 'action_checkin', label: 'Action nudge', blurb: 'Follow up on a commitment, framed as an experiment.' },
  { value: 'insight', label: 'Insight nudge', blurb: 'Re-surface a meaningful insight from a session.' },
  { value: 'framework', label: 'Framework nudge', blurb: 'Remind them of a framework you named in session.' },
]

/**
 * Create a nudge on demand. The coach picks the type, optionally anchors it to an
 * open action or a captured insight, and either drafts with AI or writes it by
 * hand. Always created as a draft for review — nothing sends from here.
 *
 * Framework nudges pull from the coach's mind garden in Phase B; until the vault
 * is connected, framework is a hand-written draft (no AI assist, no auto-pull).
 */
export function CreateNudgeModal({
  clientId,
  clientName,
  onClose,
  onCreated,
}: {
  clientId: string
  clientName: string
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<NudgeType>('action_checkin')
  const [openActions, setOpenActions] = useState<string[]>([])
  const [recentInsights, setRecentInsights] = useState<string[]>([])
  const [anchor, setAnchor] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/nudges/context`)
      .then((r) => (r.ok ? r.json() : { openActions: [], recentInsights: [] }))
      .then((d) => {
        if (cancelled) return
        setOpenActions(d.openActions || [])
        setRecentInsights(d.recentInsights || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId])

  // Reset the anchor when the type changes (the options differ).
  useEffect(() => {
    setAnchor('')
  }, [type])

  const anchorOptions = type === 'action_checkin' ? openActions : type === 'insight' ? recentInsights : []
  const canAiDraft = (type === 'action_checkin' || type === 'insight') && !!anchor
  const canCreate = !!bodyText.trim() && !saving

  async function aiDraft() {
    if (!canAiDraft) return
    setDrafting(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/nudges/draft-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, trigger_excerpt: anchor }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not draft')
      setSubject(data.subject || '')
      setBodyText(data.body || '')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDrafting(false)
    }
  }

  async function create() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/nudges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          draft_subject: subject,
          draft_body: bodyText,
          trigger_excerpt: anchor || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create nudge')
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`Create nudge · ${clientName}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Type */}
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-tlw-lg border px-3 py-2 text-left transition-colors ${
                type === t.value
                  ? 'border-tlw-navy-rich bg-tlw-navy-rich/5'
                  : 'border-tlw-warm-gray/25 hover:border-tlw-warm-gray/50'
              }`}
            >
              <div className="text-[13px] font-medium text-tlw-espresso">{t.label}</div>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-tlw-warm-gray">{TYPES.find((t) => t.value === type)?.blurb}</p>

        {/* Anchor + AI assist (action / insight) */}
        {(type === 'action_checkin' || type === 'insight') && (
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
              {type === 'action_checkin' ? 'Open action to follow up on' : 'Insight to re-surface'}
            </label>
            {anchorOptions.length === 0 ? (
              <p className="text-[12px] text-tlw-warm-gray">
                {type === 'action_checkin'
                  ? 'No open actions for this client — write the nudge by hand below.'
                  : 'No recent captured insights — write the nudge by hand below.'}
              </p>
            ) : (
              <select
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
              >
                <option value="">Choose one…</option>
                {anchorOptions.map((o, i) => (
                  <option key={i} value={o}>
                    {o.length > 90 ? `${o.slice(0, 90)}…` : o}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={aiDraft}
              disabled={!canAiDraft || drafting}
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-40"
            >
              {drafting ? 'Drafting…' : '✨ Draft with AI'}
            </button>
          </div>
        )}

        {type === 'framework' && (
          <p className="rounded-tlw-md bg-tlw-canvas px-3 py-2 text-[12px] text-tlw-warm-gray">
            Framework nudges will pull from your mind garden once the vault is connected. For now,
            write the reminder by hand.
          </p>
        )}

        {/* Draft */}
        <div className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="Write the nudge, or draft with AI above…"
            rows={7}
            className="w-full resize-y rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[13px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-navy-rich"
          />
        </div>

        {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!canCreate}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create nudge'}
          </button>
        </div>
        <p className="text-center text-[11px] text-tlw-warm-gray">
          Created as a draft — review and send it from the queue below.
        </p>
      </div>
    </Modal>
  )
}
