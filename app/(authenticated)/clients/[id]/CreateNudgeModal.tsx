'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'
import { formatGoalListForEmail } from '@/lib/nudges/goal-list'

type NudgeType = 'action_checkin' | 'insight' | 'framework' | 'goals'
type GoalAngle = 'reminder' | 'assessment' | 'win'

const TYPES: { value: NudgeType; label: string; blurb: string }[] = [
  { value: 'action_checkin', label: 'Action nudge', blurb: 'Follow up on a commitment, framed as an experiment.' },
  { value: 'insight', label: 'Insight nudge', blurb: 'Re-surface a meaningful insight from a session.' },
  { value: 'framework', label: 'Framework nudge', blurb: 'Remind them of a framework you named in session.' },
  { value: 'goals', label: 'Goals nudge', blurb: 'Check in on their engagement goals — one goal or all of them.' },
]

const GOAL_ANGLES: { value: GoalAngle; label: string; blurb: string }[] = [
  { value: 'reminder', label: 'Action reminder', blurb: 'Bring the goal back into view with one small step to try this week.' },
  { value: 'assessment', label: 'Goals assessment', blurb: 'Ask how the goals are sitting and invite them to adjust.' },
  { value: 'win', label: 'Win check', blurb: 'Invite them to name a recent win connected to the goal.' },
]

/**
 * Create a nudge on demand. The coach picks the type, optionally anchors it to an
 * open action or a captured insight, and either drafts with AI or writes it by
 * hand. Always created as a draft for review — nothing sends from here.
 *
 * Framework nudges (Phase B) pull from the coach's mind garden: pick a surfaceable
 * leaf and AI-draft a re-surfacing from its live content. If the coach has no
 * surfaceable leaves yet, framework falls back to a hand-written draft.
 */
type FrameworkOption = { id: string; title: string; summary: string | null }
type GoalOption = { title: string; description: string; metrics?: string[] }
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
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([])
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [anchor, setAnchor] = useState('')
  const [goalAngle, setGoalAngle] = useState<GoalAngle>('reminder')
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
        setFrameworks(d.frameworks || [])
        setGoals(d.goals || [])
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

  // Goals nudge: the selected goal(s) go into the body verbatim — bulleted, with
  // metrics beneath — so the client gets a quick reference even on a hand-written
  // nudge. The block is tracked so switching the selection replaces it instead of
  // stacking; the AI draft path returns the body with the same block already
  // appended (draftNudge), which keeps the tracking consistent.
  const goalBlockRef = useRef('')
  useEffect(() => {
    const selected =
      type === 'goals' && anchor
        ? anchor === '__all__'
          ? goals
          : goals.filter((g) => g.title === anchor)
        : []
    setBodyText((cur) => {
      let next = cur
      if (goalBlockRef.current && next.includes(goalBlockRef.current)) {
        next = next.replace(goalBlockRef.current, '').replace(/\n{3,}/g, '\n\n').trim()
      }
      if (selected.length === 0) {
        goalBlockRef.current = ''
        return next
      }
      const block = formatGoalListForEmail(selected)
      goalBlockRef.current = block
      return next ? `${next.replace(/\s+$/, '')}\n\n${block}` : block
    })
  }, [type, anchor, goals])

  const anchorOptions = type === 'action_checkin' ? openActions : type === 'insight' ? recentInsights : []
  const canAiDraft = !!anchor
  const canCreate = !!bodyText.trim() && !saving

  // Human-readable line for the queue's "grounded in" display (trigger_excerpt).
  const goalAnchorLabel =
    anchor === '__all__'
      ? `All goals · ${GOAL_ANGLES.find((a) => a.value === goalAngle)?.label ?? goalAngle}`
      : `Goal: ${anchor} · ${GOAL_ANGLES.find((a) => a.value === goalAngle)?.label ?? goalAngle}`

  async function aiDraft() {
    if (!canAiDraft) return
    setDrafting(true)
    setError('')
    try {
      const payload =
        type === 'framework'
          ? { type, framework_slug: anchor }
          : type === 'goals'
          ? { type, goal_focus: anchor, goal_angle: goalAngle }
          : { type, trigger_excerpt: anchor }
      const res = await fetch(`/api/clients/${clientId}/nudges/draft-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          trigger_excerpt:
            type === 'framework'
              ? undefined
              : type === 'goals'
              ? (anchor ? goalAnchorLabel : undefined)
              : anchor || undefined,
          framework_slug: type === 'framework' ? anchor || undefined : undefined,
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
        <div className="grid grid-cols-2 gap-2">
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

        {type === 'goals' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
                Goal to nudge around
              </label>
              {goals.length === 0 ? (
                <p className="text-[12px] text-tlw-warm-gray">
                  No engagement goals on file for this client — set their goals on the workspace
                  Goals card first, or write the nudge by hand below.
                </p>
              ) : (
                <select
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
                >
                  <option value="">Choose one…</option>
                  <option value="__all__">All goals ({goals.length})</option>
                  {goals.map((g) => (
                    <option key={g.title} value={g.title}>
                      {g.title.length > 90 ? `${g.title.slice(0, 90)}…` : g.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">Angle</label>
              <div className="grid grid-cols-3 gap-2">
                {GOAL_ANGLES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setGoalAngle(a.value)}
                    className={`rounded-tlw-lg border px-3 py-2 text-left transition-colors ${
                      goalAngle === a.value
                        ? 'border-tlw-navy-rich bg-tlw-navy-rich/5'
                        : 'border-tlw-warm-gray/25 hover:border-tlw-warm-gray/50'
                    }`}
                  >
                    <div className="text-[12px] font-medium text-tlw-espresso">{a.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-tlw-warm-gray">
                {GOAL_ANGLES.find((a) => a.value === goalAngle)?.blurb}
              </p>
            </div>

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
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
              Framework to re-surface
            </label>
            {frameworks.length === 0 ? (
              <p className="text-[12px] text-tlw-warm-gray">
                No surfaceable frameworks yet — flip a leaf to{' '}
                <code className="text-tlw-espresso">nudge_eligible: true</code> in your vault and sync,
                or write the reminder by hand below.
              </p>
            ) : (
              <select
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-3 py-2 text-[13px] text-tlw-espresso outline-none focus:border-tlw-navy-rich"
              >
                <option value="">Choose one…</option>
                {frameworks.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
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
