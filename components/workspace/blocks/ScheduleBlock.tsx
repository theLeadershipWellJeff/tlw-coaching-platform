'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ScheduleCard } from '@/app/(authenticated)/clients/[id]/ScheduleCard'
import {
  useCompactFetch,
  CompactSkeleton,
  CompactEmpty,
  CompactLine,
} from '../CompactCard'

function fmtAppt(iso: string, tz?: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ScheduleCompact({ clientId, coachTimezone }: { clientId: string; coachTimezone?: string }) {
  const data = useCompactFetch<{ appointments: { scheduled_at: string }[] }>(
    `/api/clients/${clientId}/appointments`
  )
  if (!data) return <CompactSkeleton />
  const next = data.appointments?.[0]
  if (!next) return <CompactEmpty label="No upcoming sessions" />
  return <CompactLine primary={`Next: ${fmtAppt(next.scheduled_at, coachTimezone)}`} />
}

export function ScheduleBlock({ size }: { size: CardSize }) {
  const { clientId, apptReload, bumpApptReload, coachTimezone } = useWorkspaceCtx()
  if (size === 'compact') return <ScheduleCompact clientId={clientId} coachTimezone={coachTimezone} />
  return (
    <ScheduleCard
      clientId={clientId}
      reloadKey={apptReload}
      onChanged={bumpApptReload}
      coachTimezone={coachTimezone}
    />
  )
}
