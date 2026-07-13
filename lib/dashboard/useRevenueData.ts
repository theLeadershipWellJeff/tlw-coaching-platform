'use client'
/**
 * Shared revenue data hook for the revenue cards (Past / Projected / Annual).
 *
 * One fetch of the EXISTING revenue service (`/api/practice/revenue`) — no new
 * revenue math here. A tiny module-level cache (short TTL + in-flight dedupe)
 * means resizing a card never refetches, and multiple revenue cards on the same
 * dashboard share a single request.
 */
import { useEffect, useState } from 'react'

export interface RevenueWeek {
  weekStart: string
  sessions: number
  hours: number
  total: number
}

export interface MonthRevenue {
  month: number // 1..12
  actual: number
  projected: number
}

export interface AnnualRevenue {
  year: number
  actualsYtd: number
  projectedRemainder: number
  total: number
  monthly: MonthRevenue[]
}

export interface ClientRevenue {
  client: string
  sessions: number
  amount: number
}

export interface RevenuePayload {
  calendarConnected: boolean
  past: RevenueWeek
  prior: { weekStart: string; total: number }
  pastSessions: { client: string; minutes: number; amount: number }[]
  projected: RevenueWeek
  annual: AnnualRevenue
  // Per-client roll-ups for the breakdown pies. Optional so a stale cached
  // payload (pre-upgrade) can't crash the cards.
  byClient?: {
    past: ClientRevenue[]
    projected: ClientRevenue[]
    annual: ClientRevenue[]
  }
}

export interface RevenueData {
  loading: boolean
  error: boolean
  revenue: RevenuePayload | null
}

const TTL_MS = 30_000
let cache: { at: number; data: RevenuePayload } | null = null
let inflight: Promise<RevenuePayload> | null = null

async function fetchRevenue(): Promise<RevenuePayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/practice/revenue')
    if (!res.ok) throw new Error('Failed to load revenue')
    const data = (await res.json()) as RevenuePayload
    cache = { at: Date.now(), data }
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useRevenueData(): RevenueData {
  const [state, setState] = useState<RevenueData>(() =>
    cache ? { loading: false, error: false, revenue: cache.data } : { loading: true, error: false, revenue: null }
  )

  useEffect(() => {
    let active = true
    fetchRevenue()
      .then((revenue) => active && setState({ loading: false, error: false, revenue }))
      .catch(() => active && setState({ loading: false, error: true, revenue: null }))
    return () => {
      active = false
    }
  }, [])

  return state
}
