'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'
import { PanelBoard, type Panel } from '@/app/components/layout/PanelBoard'
import { ScorecardSummary } from './ScorecardSummary'
import { RosterPanel } from './RosterPanel'
import { UpNextPanel, type UpcomingSession } from './UpNextPanel'

const STORAGE_KEY = 'tlw-dashboard-layout'

// Roster on the left; scorecard summary stacked above Up next on the right.
// Coaches can rearrange (and move between columns) via the Arrange button.
const DEFAULT_LAYOUT = [['roster'], ['summary', 'upnext']]

export function DashboardBoard() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState('')

  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState(false)

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
  }, [loadClients, loadSessions])

  const panels: Panel[] = [
    { id: 'summary', label: 'Scorecard summary', node: <ScorecardSummary /> },
    {
      id: 'roster',
      label: 'Clients',
      node: <RosterPanel clients={clients} loading={clientsLoading} error={clientsError} />,
    },
    {
      id: 'upnext',
      label: 'Up next',
      node: (
        <UpNextPanel
          sessions={sessions}
          clients={clients}
          loading={sessionsLoading}
          error={sessionsError}
          onRefresh={loadSessions}
        />
      ),
    },
  ]

  return <PanelBoard storageKey={STORAGE_KEY} panels={panels} columns={2} defaultLayout={DEFAULT_LAYOUT} />
}
