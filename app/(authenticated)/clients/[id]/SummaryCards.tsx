'use client'
import { useEffect, useState } from 'react'
import { MiniListCard, type MiniItem } from './MiniListCard'

function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function TranscriptsCard({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<MiniItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/transcripts`)
      .then((r) => (r.ok ? r.json() : { transcripts: [] }))
      .then((d) => {
        if (cancelled) return
        setItems(
          (d.transcripts || []).map((t: any) => ({
            id: t.id,
            label: t.filename || 'Transcript',
            sub: [fmtDate(t.session_date), t.match_status === 'needs_review' ? 'needs review' : '']
              .filter(Boolean)
              .join(' · '),
          }))
        )
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

  return (
    <MiniListCard
      title="Transcripts"
      href={`/clients/${clientId}/transcripts`}
      items={items}
      loading={loading}
      emptyText="No transcripts yet."
    />
  )
}

export function NotesCard({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<MiniItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/notes`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d) => {
        if (cancelled) return
        setItems(
          (d.notes || []).map((n: any) => ({
            id: n.id,
            label: n.title?.trim() || 'Untitled note',
            sub: fmtDate(n.session_date),
          }))
        )
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId])

  return (
    <MiniListCard
      title="Notes"
      href={`/clients/${clientId}/notes`}
      items={items}
      loading={loading}
      emptyText="No notes yet."
    />
  )
}
