'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { PanelBoard, type Panel } from '@/app/components/layout/PanelBoard'
import { ScorecardSummary } from './ScorecardSummary'
import { RosterPanel } from './RosterPanel'
import { UpNextPanel, type UpcomingSession } from './UpNextPanel'
import { SuggestedNudgesPanel } from './SuggestedNudgesPanel'
import { UnmatchedBookingsPanel } from './UnmatchedBookingsPanel'

const STORAGE_KEY = 'tlw-dashboard-layout'
const SKIPPED_KEY = 'tlw-dashboard-skipped'

// Roster on the left; scorecard summary, suggested nudges, and Up next stacked on
// the right. Coaches can rearrange, move between columns, and add/remove panels
// via the Arrange button.
const DEFAULT_LAYOUT = [['roster'], ['summary', 'unmatched', 'nudges', 'upnext']]

export function DashboardBoard() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState('')

  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState(false)

  // Sessions the coach chose to skip — hidden from Up next, persisted locally
  // (these are calendar-derived, so there's no server-side prep row to mark).
  const [skipped, setSkipped] = useState<string[]>([])

  // The coach's configured timezone drives every date/time label here, so the
  // dashboard reads the same on any device. Seed with the browser zone until the
  // profile loads.
  const [timeZone, setTimeZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
    } catch {
      return 'America/Los_Angeles'
    }
  })

  const loadClients = useCallback(async () => {
    setClientsLoading(true)
    setClientsError('')
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load clients')
      setClients(data.clients || [])
    } catch (e: any) {
      setClientsError(e.message)
    }
    setClientsLoading(false)
  }, [])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError(false)
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
      setSessionsError(true)
    }
    setSessionsLoading(false)
  }, [])

  useEffect(() => {
    loadClients()
    loadSessions()
    // Coach timezone for all date/time labels.
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.coach?.timezone && setTimeZone(d.coach.timezone))
      .catch(() => {})
    // Restore skipped sessions.
    try {
      const raw = localStorage.getItem(SKIPPED_KEY)
      if (raw) setSkipped(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [loadClients, loadSessions])

  const skipSession = useCallback((id: string) => {
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

  // Hide skipped sessions, and keep the stored set pruned to live event ids so it
  // can't grow without bound as past sessions roll off the calendar.
  const skippedSet = new Set(skipped)
  const visibleSessions = sessions.filter((s) => !skippedSet.has(s.id))
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

  const panels: Panel[] = [
    { id: 'summary', label: 'Scorecard summary', node: <ScorecardSummary /> },
    {
      id: 'roster',
      label: 'Clients',
      node: <RosterPanel clients={clients} loading={clientsLoading} error={clientsError} />,
    },
    {
      id: 'nudges',
      label: 'Suggested nudges',
      node: <SuggestedNudgesPanel timeZone={timeZone} />,
    },
    {
      id: 'unmatched',
      label: 'Unmatched bookings',
      node: <UnmatchedBookingsPanel clients={clients} timeZone={timeZone} />,
    },
    {
      id: 'upnext',
      label: 'Up next',
      node: (
        <UpNextPanel
          sessions={visibleSessions}
          clients={clients}
          loading={sessionsLoading}
          error={sessionsError}
          onRefresh={loadSessions}
          onSkip={skipSession}
          timeZone={timeZone}
        />
      ),
    },
  ]

  return <PanelBoard storageKey={STORAGE_KEY} panels={panels} columns={2} defaultLayout={DEFAULT_LAYOUT} />
}
