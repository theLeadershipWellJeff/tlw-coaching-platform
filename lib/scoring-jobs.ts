'use client'
import { useSyncExternalStore } from 'react'

/**
 * Client-side scoring-job tracker. Scoring a transcript takes ~2 minutes and
 * runs entirely server-side (`PATCH /api/transcripts/[id]` — the serverless
 * function runs to completion even if the coach navigates away or closes the
 * tab). This module makes that visible: firing a score registers a job here
 * (persisted in localStorage), the UI renders a progress bar off `startedAt`,
 * and any page can pick the job back up later. If the in-page fetch was lost
 * to a full reload, a poller watches `/api/reports` for the transcript's
 * report to appear and resolves the job from that.
 */

export const EXPECTED_SCORING_SECONDS = 120
// Engine times out at 100s and the route at 120s — well past that with no
// report, the run failed (or the response was lost); surface a retry.
const MAX_WAIT_MS = 5 * 60_000
const POLL_MS = 10_000
const DONE_TTL_MS = 24 * 60 * 60 * 1000
const KEY = 'tlw-scoring-jobs'

export type ScoringJob = {
  transcriptId: string
  /** e.g. "Maria G · Session · Jun 12, 2026" — shown next to the bar. */
  label: string
  /** The PATCH body, kept so retry re-fires the exact same request. */
  body: Record<string, unknown>
  startedAt: number
  status: 'running' | 'done' | 'error'
  reportId?: string
  error?: string
}

const EMPTY: ScoringJob[] = []
let jobs: ScoringJob[] = EMPTY
let loaded = false
const listeners = new Set<() => void>()
// Transcript ids whose PATCH is alive in THIS page lifetime — those resolve via
// the fetch itself; only orphaned running jobs (page was reloaded) need polling.
const inFlight = new Set<string>()
let pollTimer: ReturnType<typeof setInterval> | null = null

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: ScoringJob[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    jobs = parsed.filter(
      (j) => j && j.transcriptId && (j.status === 'running' || now - j.startedAt < DONE_TTL_MS)
    )
  } catch {
    jobs = []
  }
  syncPolling()
}

function commit(next: ScoringJob[]) {
  jobs = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full/unavailable — in-memory state still drives this page.
  }
  syncPolling()
  listeners.forEach((l) => l())
}

function patchJob(transcriptId: string, patch: Partial<ScoringJob>) {
  commit(jobs.map((j) => (j.transcriptId === transcriptId ? { ...j, ...patch } : j)))
}

export function subscribeScoringJobs(fn: () => void): () => void {
  ensureLoaded()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getScoringJobs(): ScoringJob[] {
  ensureLoaded()
  return jobs
}

export function useScoringJobs(): ScoringJob[] {
  return useSyncExternalStore(subscribeScoringJobs, getScoringJobs, () => EMPTY)
}

/**
 * Fire-and-forget: registers the job and sends the PATCH without blocking the
 * caller — the coach can leave the page and the score keeps going.
 */
export function startScoring(opts: { transcriptId: string; label: string; body: Record<string, unknown> }) {
  ensureLoaded()
  const job: ScoringJob = {
    transcriptId: opts.transcriptId,
    label: opts.label,
    body: opts.body,
    startedAt: Date.now(),
    status: 'running',
  }
  commit([job, ...jobs.filter((j) => j.transcriptId !== opts.transcriptId)])
  fire(job)
}

export function retryScoring(transcriptId: string) {
  ensureLoaded()
  const job = jobs.find((j) => j.transcriptId === transcriptId)
  if (!job) return
  patchJob(transcriptId, { status: 'running', startedAt: Date.now(), error: undefined })
  fire(job)
}

export function dismissScoringJob(transcriptId: string) {
  ensureLoaded()
  commit(jobs.filter((j) => j.transcriptId !== transcriptId))
}

function fire(job: ScoringJob) {
  inFlight.add(job.transcriptId)
  fetch(`/api/transcripts/${job.transcriptId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job.body),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}) as any)
      if (res.ok) patchJob(job.transcriptId, { status: 'done', reportId: data.reportId })
      else patchJob(job.transcriptId, { status: 'error', error: data.error || 'Scoring failed. Please try again.' })
    })
    .catch(() => {
      // The server may still finish (only the response was lost) — let the
      // poller decide before the coach retries.
      inFlight.delete(job.transcriptId)
      syncPolling()
    })
    .finally(() => inFlight.delete(job.transcriptId))
}

function syncPolling() {
  const needsPoll = jobs.some((j) => j.status === 'running' && !inFlight.has(j.transcriptId))
  if (needsPoll && !pollTimer) pollTimer = setInterval(poll, POLL_MS)
  if (!needsPoll && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function poll() {
  const orphans = jobs.filter((j) => j.status === 'running' && !inFlight.has(j.transcriptId))
  if (orphans.length === 0) return
  try {
    const res = await fetch('/api/reports')
    if (!res.ok) return
    const data = await res.json()
    const reportByTranscript = new Map<string, string>(
      ((data.reports || []) as { id: string; transcript_id: string | null }[])
        .filter((r) => r.transcript_id)
        .map((r) => [r.transcript_id as string, r.id])
    )
    for (const j of orphans) {
      const reportId = reportByTranscript.get(j.transcriptId)
      if (reportId) patchJob(j.transcriptId, { status: 'done', reportId })
      else if (Date.now() - j.startedAt > MAX_WAIT_MS)
        patchJob(j.transcriptId, {
          status: 'error',
          error: 'Scoring did not finish. The transcript is safe on the client — retry here or from their transcripts list.',
        })
    }
  } catch {
    // Network blip — next tick tries again.
  }
}
