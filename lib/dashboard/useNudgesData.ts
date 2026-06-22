'use client'
/**
 * Shared data hook for the Nudges card — one fetch of the coach's SENT nudges.
 * Short module cache + in-flight dedupe so resizing never refetches (brief §3.2).
 */
import { useEffect, useState } from 'react'
import type { NudgeRow } from '@/app/(authenticated)/nudges/NudgeItem'

export interface NudgesPayload {
  count: number
  items: NudgeRow[]
}

export interface NudgesData {
  loading: boolean
  error: boolean
  nudges: NudgesPayload | null
}

const TTL_MS = 30_000
let cache: { at: number; data: NudgesPayload } | null = null
let inflight: Promise<NudgesPayload> | null = null

async function fetchNudges(): Promise<NudgesPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/dashboard/nudges')
    if (!res.ok) throw new Error('Failed to load nudges')
    const data = (await res.json()) as NudgesPayload
    cache = { at: Date.now(), data }
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useNudgesData(): NudgesData {
  const [state, setState] = useState<NudgesData>(() =>
    cache ? { loading: false, error: false, nudges: cache.data } : { loading: true, error: false, nudges: null }
  )

  useEffect(() => {
    let active = true
    fetchNudges()
      .then((nudges) => active && setState({ loading: false, error: false, nudges }))
      .catch(() => active && setState({ loading: false, error: true, nudges: null }))
    return () => {
      active = false
    }
  }, [])

  return state
}
