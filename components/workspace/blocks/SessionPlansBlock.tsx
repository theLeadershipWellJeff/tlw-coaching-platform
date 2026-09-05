'use client'
import { useEffect, useState } from 'react'
import type { CardSize } from '@/lib/dashboard/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { SessionPlansCard, type SessionPlanRow } from '@/app/(authenticated)/clients/[id]/SessionPlansCard'
import { PLANS_CHANGED_EVENT } from '@/app/components/plan/PlanSessionContent'
import { CompactSkeleton, CompactEmpty, CompactStat } from '../CompactCard'

function SessionPlansCompact({ clientId }: { clientId: string }) {
  const [plans, setPlans] = useState<SessionPlanRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch(`/api/clients/${clientId}/plans`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setPlans(d.plans || []))
        .catch(() => {})
    load()
    window.addEventListener(PLANS_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(PLANS_CHANGED_EVENT, load)
    }
  }, [clientId])

  if (!plans) return <CompactSkeleton />
  if (plans.length === 0) return <CompactEmpty label="No saved plans" />
  const latest = plans[0]
  return (
    <CompactStat
      count={plans.length}
      label={plans.length === 1 ? 'saved plan' : 'saved plans'}
      sub={latest.title || undefined}
    />
  )
}

export function SessionPlansBlock({ size }: { size: CardSize }) {
  const { clientId, client } = useWorkspaceCtx()
  if (size === 'compact') return <SessionPlansCompact clientId={clientId} />
  return <SessionPlansCard clientId={clientId} clientName={client?.name || ''} />
}
