'use client'
import { useSyncExternalStore } from 'react'
import type { CoachingGoal } from '@/lib/supabase/types'

/**
 * Client-side goal-generation job tracker (same shape as lib/scoring-jobs.ts).
 * Generating coaching goals takes ~20–45 s and runs entirely server-side —
 * `POST /api/clients/[id]/goals/generate` persists the merged goals to the
 * client record itself, so the serverless function finishes even if the coach
 * navigates away or closes the tab. Firing a generation registers a job here
 * (persisted in localStorage), the goals cards render a "generating" state off
 * it, and any page can pick the job back up later. If the in-page fetch was
 * lost to a reload, a poller watches the client record: coaching_goals
 * differing from the job's baseline means the run landed.
 */

// The route's maxDuration is 60 s — well past that with no change, the run
// failed (or the response was lost); surface a retry.
const MAX_WAIT_MS = 3 * 60_000
const POLL_MS = 8_000
const DONE_TTL_MS = 60 * 60 * 1000
const KEY = 'tlw-goal-jobs'

export type GoalJob = {
  clientId: string
  /** JSON of coaching_goals at job start — the poller treats a change as done. */
  baseline: string
  startedAt: number
  status: 'running' | 'done' | 'error'
  /** The merged goals returned by the route (or read by the poller) on success. */
  goals?: CoachingGoal[]
  error?: string
}

const EMPTY: GoalJob[] = []
let jobs: GoalJob[] = EMPTY
let loaded = false
const listeners = new Set<() => void>()
// Client ids whose POST is alive in THIS page lifetime — those resolve via the
// fetch itself; only orphaned running jobs (page was reloaded) need polling.
const inFlight = new Set<string>()
let pollTimer: ReturnType<typeof setInterval> | null = null

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: GoalJob[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    jobs = parsed.filter(
      (j) => j && j.clientId && (j.status === 'running' || now - j.startedAt < DONE_TTL_MS)
    )
  } catch {
    jobs = []
  }
  syncPolling()
}

function commit(next: GoalJob[]) {
  jobs = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full/unavailable — in-memory state still drives this page.
  }
  syncPolling()
  listeners.forEach((l) => l())
}

function patchJob(clientId: string, patch: Partial<GoalJob>) {
  commit(jobs.map((j) => (j.clientId === clientId ? { ...j, ...patch } : j)))
}

export function subscribeGoalJobs(fn: () => void): () => void {
  ensureLoaded()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getGoalJobs(): GoalJob[] {
  ensureLoaded()
  return jobs
}

export function useGoalJobs(): GoalJob[] {
  return useSyncExternalStore(subscribeGoalJobs, getGoalJobs, () => EMPTY)
}

/**
 * Fire-and-forget: registers the job and sends the POST without blocking the
 * caller — the coach can leave the page and the generation keeps going.
 */
export function startGoalGeneration(clientId: string, currentGoals: CoachingGoal[] | null) {
  ensureLoaded()
  const job: GoalJob = {
    clientId,
    baseline: JSON.stringify(currentGoals ?? []),
    startedAt: Date.now(),
    status: 'running',
  }
  commit([job, ...jobs.filter((j) => j.clientId !== clientId)])
  fire(job)
}

export function retryGoalGeneration(clientId: string) {
  ensureLoaded()
  const job = jobs.find((j) => j.clientId === clientId)
  if (!job) return
  patchJob(clientId, { status: 'running', startedAt: Date.now(), error: undefined })
  fire(job)
}

export function dismissGoalJob(clientId: string) {
  ensureLoaded()
  commit(jobs.filter((j) => j.clientId !== clientId))
}

function fire(job: GoalJob) {
  inFlight.add(job.clientId)
  fetch(`/api/clients/${job.clientId}/goals/generate`, { method: 'POST' })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}) as any)
      if (res.ok) patchJob(job.clientId, { status: 'done', goals: data.goals })
      else patchJob(job.clientId, { status: 'error', error: data.error || 'Could not generate goals.' })
    })
    .catch(() => {
      // The server may still finish (only the response was lost) — let the
      // poller decide before the coach retries.
      inFlight.delete(job.clientId)
      syncPolling()
    })
    .finally(() => inFlight.delete(job.clientId))
}

function syncPolling() {
  const needsPoll = jobs.some((j) => j.status === 'running' && !inFlight.has(j.clientId))
  if (needsPoll && !pollTimer) pollTimer = setInterval(poll, POLL_MS)
  if (!needsPoll && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function poll() {
  const orphans = jobs.filter((j) => j.status === 'running' && !inFlight.has(j.clientId))
  for (const j of orphans) {
    try {
      const res = await fetch(`/api/clients/${j.clientId}`)
      if (!res.ok) continue
      const data = await res.json()
      const goals = (data.client?.coaching_goals ?? []) as CoachingGoal[]
      if (JSON.stringify(goals) !== j.baseline) {
        patchJob(j.clientId, { status: 'done', goals })
      } else if (Date.now() - j.startedAt > MAX_WAIT_MS) {
        patchJob(j.clientId, {
          status: 'error',
          error: 'Goal generation did not finish — nothing was changed. Retry when ready.',
        })
      }
    } catch {
      // Network blip — next tick tries again.
    }
  }
}
