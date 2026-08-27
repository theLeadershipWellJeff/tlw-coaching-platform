'use client'
import { usePlanSessionWindows } from '@/app/components/plan/PlanSessionWindows'

/**
 * Notes-page companion to the workspace "Plan next session" action. A compact
 * card that opens the same floating prep window — goals, open actions,
 * insights, and any NEXT TIME / NEXT SESSION flags, plus a quick summary and
 * three opening questions. The window is movable/resizable and survives
 * navigating around the app, so it can sit beside the note being written.
 */
export function PlanSessionCard({ clientId, clientName }: { clientId: string; clientName: string }) {
  const { openPlanWindow } = usePlanSessionWindows()

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
            Plan next session
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-tlw-warm-gray/80">
            Pulls goals, open actions, insights &amp; any “next time” flags into a movable prep window.
          </p>
        </div>
        <button
          onClick={() => openPlanWindow(clientId, clientName)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-tlw-lg px-3 py-2 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
          style={{ background: '#E8650A' }}
        >
          <span aria-hidden>✦</span> Plan
        </button>
      </div>
    </div>
  )
}
