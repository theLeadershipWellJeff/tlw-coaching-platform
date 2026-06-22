'use client'
/**
 * Up next card — upcoming sessions (next 7 days) with session-prep links and
 * skip, wrapping the existing UpNextPanel (self-headed). Self-contained: fetches
 * /api/sessions and manages the skipped set in localStorage, exactly as the old
 * dashboard board did (shared skip key, so skips carry over).
 */
import { useCallback, useEffect, useState } from 'react'
import { CARD_META } from '@/lib/dashboard/cards'
import { useClients } from '@/lib/dashboard/useClients'
import { useCoachTimezone } from '@/lib/dashboard/useCoachTimezone'
import { UpNextPanel, type UpcomingSession } from '@/app/(authenticated)/dashboard/UpNextPanel'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

const SKIPPED_KEY = 'tlw-dashboard-skipped'

function UpNextBody({ size }: { size: CardSize }) {
  const { clients } = useClients()
  const timeZone = useCoachTimezone()
  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const cutoff = Date.now() + 7 * 24 * 60 * 60 * 1000
      const within7 = (data.sessions || []).filter((s: UpcomingSession) => {
        if (!s.start) return false
        const t = new Date(s.start).getTime()
        return t >= Date.now() - 60 * 60 * 1000 && t <= cutoff
      })
      setSessions(within7)
    } catch {
      setError(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    try {
      const raw = localStorage.getItem(SKIPPED_KEY)
      if (raw) setSkipped(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [load])

  const skip = useCallback((id: string) => {
    setSkipped((prev) => {
      if (prev.includes(id)) return prev
      const next = [...prev, id]
      try {
        localStorage.setItem(SKIPPED_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  // Keep the stored skip set pruned to live event ids so it can't grow unbounded.
  useEffect(() => {
    if (sessions.length === 0) return
    const live = new Set(sessions.map((s) => s.id))
    const pruned = skipped.filter((id) => live.has(id))
    if (pruned.length !== skipped.length) {
      setSkipped(pruned)
      try {
        localStorage.setItem(SKIPPED_KEY, JSON.stringify(pruned))
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions])

  const skippedSet = new Set(skipped)
  const visible = sessions.filter((s) => !skippedSet.has(s.id))

  return (
    <UpNextPanel
      sessions={visible}
      clients={clients}
      loading={loading}
      error={error}
      onRefresh={load}
      onSkip={skip}
      timeZone={timeZone}
      size={size}
    />
  )
}

export const upNextCard: DashboardCard<null> = {
  ...CARD_META['up-next'],
  useData: () => null,
  render: ({ size }) => <UpNextBody size={size} />,
}
