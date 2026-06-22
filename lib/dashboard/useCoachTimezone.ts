'use client'
/**
 * Shared cached fetch of the coach's timezone (/api/coach), used by the cards
 * that render time labels (Up next, Suggested nudges, Unmatched bookings). Seeds
 * with the browser zone until the profile loads.
 */
import { useEffect, useState } from 'react'

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
}

const TTL_MS = 60_000
let cache: { at: number; tz: string } | null = null
let inflight: Promise<string> | null = null

async function fetchTimezone(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.tz
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/coach')
    const tz = res.ok ? (await res.json())?.coach?.timezone : null
    const zone = tz || browserZone()
    cache = { at: Date.now(), tz: zone }
    return zone
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useCoachTimezone(): string {
  const [tz, setTz] = useState<string>(() => cache?.tz || browserZone())

  useEffect(() => {
    let active = true
    fetchTimezone()
      .then((zone) => active && setTz(zone))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return tz
}
