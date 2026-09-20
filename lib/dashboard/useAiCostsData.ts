'use client'
/**
 * Shared data hook for the dashboard "Assistant usage" card — one fetch of the
 * coach's own clients' portal-assistant spend this month (`/api/ai-costs`,
 * scoped server-side by the coach_clients link). Short module cache +
 * in-flight dedupe so resizing never refetches.
 */
import { useEffect, useState } from 'react'
import type { CoachCostReport } from '@/lib/ai/costs'

export interface AiCostsData {
  loading: boolean
  error: boolean
  unavailable: boolean
  report: CoachCostReport | null
}

type Payload = { report: CoachCostReport | null; unavailable?: boolean }

const TTL_MS = 30_000
let cache: { at: number; data: Payload } | null = null
let inflight: Promise<Payload> | null = null

async function fetchCosts(): Promise<Payload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/ai-costs')
    if (!res.ok) throw new Error('Failed to load assistant usage')
    const data = (await res.json()) as Payload
    cache = { at: Date.now(), data }
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useAiCostsData(): AiCostsData {
  const [state, setState] = useState<AiCostsData>({ loading: true, error: false, unavailable: false, report: null })
  useEffect(() => {
    let cancelled = false
    fetchCosts()
      .then((d) => {
        if (!cancelled) setState({ loading: false, error: false, unavailable: !!d.unavailable || !d.report, report: d.report })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true, unavailable: false, report: null })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
