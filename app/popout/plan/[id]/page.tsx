'use client'
import { useEffect } from 'react'
import { PlanSessionContent, usePlanSession } from '@/app/components/plan/PlanSessionContent'

// The "Plan next session" brief in a chromeless page, meant to be opened via
// window.open from the floating plan window — a real OS-level browser window
// the coach can move anywhere on the desktop (next to Zoom, over other apps).
// Lives OUTSIDE the (authenticated) group so it renders without the app shell;
// access control is the plan-session API route itself (requireClientCoach —
// signed out or wrong coach just gets the error state, never plan data).

export default function PlanPopoutPage({ params }: { params: { id: string } }) {
  const { loading, error, data, reload } = usePlanSession(params.id)

  // Title the OS window once the (authorized) response names the client.
  useEffect(() => {
    document.title = data?.clientName
      ? `Plan · ${data.clientName} · theLeadershipWell`
      : 'Plan next session · theLeadershipWell'
  }, [data?.clientName])

  return (
    <main className="min-h-screen bg-tlw-surface">
      <header className="sticky top-0 border-b border-tlw-warm-gray/15 bg-tlw-canvas/95 px-5 py-3 backdrop-blur">
        <h1 className="truncate text-[15px] font-medium text-tlw-navy-deep">Plan next session</h1>
        {data?.clientName && <p className="text-[12px] text-tlw-warm-gray">{data.clientName}</p>}
      </header>
      <div className="px-5 py-4">
        <PlanSessionContent loading={loading} error={error} data={data} onReload={reload} />
      </div>
    </main>
  )
}
