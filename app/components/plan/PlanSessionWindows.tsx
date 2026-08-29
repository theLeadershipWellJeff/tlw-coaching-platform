'use client'
import { createContext, useContext, useState } from 'react'
import { FloatingWindow } from '@/app/components/shared/FloatingWindow'
import { PlanSessionContent, usePlanSession } from './PlanSessionContent'

// Floating "Plan next session" windows. The provider mounts once in the
// (authenticated) layout — ABOVE the pages — so an open plan window survives
// navigating from the client workspace to the session notes page (and anywhere
// else in the app). One window per client; opening again brings it to front.

type OpenPlan = { clientId: string; clientName: string }

const Ctx = createContext<{ openPlanWindow: (clientId: string, clientName: string) => void } | null>(null)

export function usePlanSessionWindows() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePlanSessionWindows must be used inside PlanSessionWindowProvider')
  return ctx
}

export function PlanSessionWindowProvider({ children }: { children: React.ReactNode }) {
  // Ordered back → front; last = on top.
  const [windows, setWindows] = useState<OpenPlan[]>([])

  function openPlanWindow(clientId: string, clientName: string) {
    setWindows((prev) => [...prev.filter((w) => w.clientId !== clientId), { clientId, clientName }])
  }

  function close(clientId: string) {
    setWindows((prev) => prev.filter((w) => w.clientId !== clientId))
  }

  return (
    <Ctx.Provider value={{ openPlanWindow }}>
      {children}
      {windows.map((w, i) => (
        <PlanWindow
          key={w.clientId}
          clientId={w.clientId}
          clientName={w.clientName}
          stackIndex={i}
          zIndex={40 + i}
          onFocus={() => openPlanWindow(w.clientId, w.clientName)}
          onClose={() => close(w.clientId)}
        />
      ))}
    </Ctx.Provider>
  )
}

function PlanWindow({
  clientId,
  clientName,
  stackIndex,
  zIndex,
  onFocus,
  onClose,
}: {
  clientId: string
  clientName: string
  stackIndex: number
  zIndex: number
  onFocus: () => void
  onClose: () => void
}) {
  // The window stays mounted across navigation, so the generated plan persists
  // until the coach closes it (or hits Regenerate).
  const { loading, error, data, reload } = usePlanSession(clientId)

  // A real OS-level window — movable anywhere on the desktop, next to Zoom.
  function popOut() {
    window.open(
      `/popout/plan/${clientId}`,
      `tlw-plan-${clientId}`,
      'width=560,height=680,left=140,top=100'
    )
    onClose()
  }

  return (
    <FloatingWindow
      title="Plan next session"
      subtitle={clientName}
      ariaLabel={`Plan next session · ${clientName}`}
      stackIndex={stackIndex}
      zIndex={zIndex}
      width={480}
      height={560}
      onFocus={onFocus}
      onClose={onClose}
      headerActions={
        <button
          onClick={popOut}
          title="Pop out to its own window (move it anywhere on your desktop)"
          aria-label="Pop out to a separate window"
          className="shrink-0 rounded-tlw-md px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
        >
          ⧉
        </button>
      }
    >
      <div className="px-4 py-3">
        <PlanSessionContent loading={loading} error={error} data={data} onReload={reload} />
      </div>
    </FloatingWindow>
  )
}
