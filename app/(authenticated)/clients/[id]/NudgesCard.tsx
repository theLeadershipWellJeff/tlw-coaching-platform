'use client'
import { useCallback, useEffect, useState } from 'react'
import { NudgeItem, type NudgeRow } from '../../nudges/NudgeItem'

/**
 * Workspace Nudges card — this client's drafted/scheduled/sent nudges, plus a
 * "Draft nudges" button to generate fresh ones from current context on demand
 * (the same engine that runs after scoring). Review + send happen inline; the
 * cross-client review screen lives at /nudges.
 */
export function NudgesCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<NudgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/nudges`)
    const data = await res.json().catch(() => ({ nudges: [] }))
    setRows(data.nudges || [])
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  async function generate() {
    setGenerating(true)
    setNote('')
    try {
      const res = await fetch(`/api/clients/${clientId}/nudges/generate`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not draft nudges')
      setNote(
        data.created > 0
          ? `Drafted ${data.created} nudge${data.created === 1 ? '' : 's'}.`
          : 'Nothing to nudge right now — no new open actions or insights.'
      )
      await load()
    } catch (e: any) {
      setNote(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const pending = rows.filter((n) => n.status !== 'sent')

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Nudges</p>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[12px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50 disabled:opacity-50"
        >
          {generating ? 'Drafting…' : 'Draft nudges'}
        </button>
      </div>

      {note && <p className="mb-3 text-[12px] text-tlw-warm-gray">{note}</p>}

      {loading ? (
        <div className="h-12 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-tlw-warm-gray">
          No nudges yet. They&apos;re drafted automatically after a session is scored, or press
          “Draft nudges.”
        </p>
      ) : (
        <div className="space-y-3">
          {(pending.length ? pending : rows).map((n) => (
            <NudgeItem key={n.id} nudge={n} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
