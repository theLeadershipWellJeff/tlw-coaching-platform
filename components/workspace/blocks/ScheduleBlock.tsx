'use client'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { ScheduleCard } from '@/app/(authenticated)/clients/[id]/ScheduleCard'

export function ScheduleBlock({ size: _size }: { size: CardSize }) {
  const { clientId, apptReload, bumpApptReload, coachTimezone } = useWorkspaceCtx()
  return (
    <ScheduleCard
      clientId={clientId}
      reloadKey={apptReload}
      onChanged={bumpApptReload}
      coachTimezone={coachTimezone}
    />
  )
}
