'use client'
/**
 * Shared data hook for the Calendar heat-map card — one fetch of booked
 * hours/day from the coach's Google Calendar. Short module cache + in-flight
 * dedupe so resizing never refetches (brief §3.2).
 */
import { useEffect, useState } from 'react'

export interface DayLoad {
  hours: number
  sessions: { title: string; start: string; durationMinutes: number }[]
}

export interface CalendarPayload {
  timezone: string
  calendarConnected: boolean
  today: string // YYYY-MM-DD
  year: number
  month: number // 1..12
  days: Record<string, DayLoad>
}

export interface CalendarData {
  loading: boolean
  error: boolean
  calendar: CalendarPayload | null
}

const TTL_MS = 30_000
let cache: { at: number; data: CalendarPayload } | null = null
let inflight: Promise<CalendarPayload> | null = null

async function fetchCalendar(): Promise<CalendarPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/dashboard/calendar-load')
    if (!res.ok) throw new Error('Failed to load calendar')
    const data = (await res.json()) as CalendarPayload
    cache = { at: Date.now(), data }
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useCalendarData(): CalendarData {
  const [state, setState] = useState<CalendarData>(() =>
    cache ? { loading: false, error: false, calendar: cache.data } : { loading: true, error: false, calendar: null }
  )

  useEffect(() => {
    let active = true
    fetchCalendar()
      .then((calendar) => active && setState({ loading: false, error: false, calendar }))
      .catch(() => active && setState({ loading: false, error: true, calendar: null }))
    return () => {
      active = false
    }
  }, [])

  return state
}
