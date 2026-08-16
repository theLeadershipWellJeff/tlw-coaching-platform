'use client'
import { useState } from 'react'
import { PortalTour, TourReplayLink } from './PortalTour'

/**
 * Client-side chrome around the (server-rendered) portal home: the first-visit
 * tour and its replay link. Kept separate so the page itself stays a server
 * component and its data never round-trips through the browser.
 */
export function PortalShell({ onboarded }: { onboarded: boolean }) {
  const [openSignal, setOpenSignal] = useState(0)
  return (
    <>
      <PortalTour onboarded={onboarded} openSignal={openSignal} />
      <div className="mt-8 flex justify-center">
        <TourReplayLink onReplay={() => setOpenSignal((v) => v + 1)} />
      </div>
    </>
  )
}
