'use client'
import { useState } from 'react'
import { PortalTour, TourReplayLink } from './PortalTour'

/**
 * Client-side chrome around the (server-rendered) portal home: the first-visit
 * tour and its replay link. Kept separate so the page itself stays a server
 * component and its data never round-trips through the browser.
 */
export function PortalShell({
  onboarded,
  hasCoach = true,
  assessmentsEnabled = false,
  hasBooking = true,
}: {
  onboarded: boolean
  hasCoach?: boolean
  assessmentsEnabled?: boolean
  hasBooking?: boolean
}) {
  const [openSignal, setOpenSignal] = useState(0)
  return (
    <>
      <PortalTour
        onboarded={onboarded}
        openSignal={openSignal}
        hasCoach={hasCoach}
        assessmentsEnabled={assessmentsEnabled}
        hasBooking={hasBooking}
      />
      <div className="mt-8 flex justify-center">
        <TourReplayLink onReplay={() => setOpenSignal((v) => v + 1)} />
      </div>
    </>
  )
}
