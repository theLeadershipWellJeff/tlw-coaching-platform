/**
 * Cron run log — the reviewable failure queue for every Vercel cron
 * (migration 067, `cron_runs`).
 *
 * Silent failure is the platform's most dangerous failure mode: until 067 every
 * cron returned JSON and, when it died, left nothing behind. Now each run
 * claims a `running` row before doing anything and closes it as `ok` (with a
 * summary) or `failed` (with the error text). A job that never closes its row
 * is itself evidence — a `running` row older than an hour means the function
 * was killed mid-run.
 *
 * Every write here is best-effort and defensive: a missing table (pre-067) or
 * a logging hiccup must never break the job it is logging.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'
import { getSupabaseAdmin } from './supabase/server'

type Db = SupabaseClient<Database>

export type CronRunHandle = {
  id: string | null
  ok: (summary?: Record<string, unknown>) => Promise<void>
  fail: (error: unknown, summary?: Record<string, unknown>) => Promise<void>
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/** Open a `running` row for `job`. Never throws. */
export async function startCronRun(supabase: Db, job: string): Promise<CronRunHandle> {
  let id: string | null = null
  try {
    const { data, error } = await supabase.from('cron_runs').insert({ job, status: 'running' }).select('id').single()
    if (error) console.error(`[cron_runs] could not open run for ${job}:`, error.message)
    else id = data.id
  } catch (e) {
    console.error(`[cron_runs] could not open run for ${job}:`, errorText(e))
  }
  const close = async (status: 'ok' | 'failed', summary?: Record<string, unknown>, error?: unknown) => {
    if (!id) return
    try {
      const { error: err } = await supabase
        .from('cron_runs')
        .update({
          status,
          finished_at: new Date().toISOString(),
          summary: summary ?? null,
          error: error === undefined ? null : errorText(error).slice(0, 4000),
        })
        .eq('id', id)
      if (err) console.error(`[cron_runs] could not close run ${id}:`, err.message)
    } catch (e) {
      console.error(`[cron_runs] could not close run ${id}:`, errorText(e))
    }
  }
  return {
    id,
    ok: (summary) => close('ok', summary),
    fail: (error, summary) => close('failed', summary, error),
  }
}

/**
 * Run `fn` inside a recorded run. The result is stored as the summary when it
 * is a plain object. Errors are recorded as `failed` and re-thrown — the caller
 * decides whether a failure in this job should fail the whole cron response.
 */
export async function recordCronRun<T>(supabase: Db, job: string, fn: () => Promise<T>): Promise<T> {
  const run = await startCronRun(supabase, job)
  try {
    const result = await fn()
    const summary = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, unknown>) : undefined
    // A summary that carries its own `errors` list counts as a failed run —
    // partial failure inside a loop must not read as green.
    const errs = summary && Array.isArray(summary.errors) ? summary.errors : []
    if (errs.length > 0) await run.fail(`${errs.length} error(s): ${errs.map(errorText).join(' | ').slice(0, 2000)}`, summary)
    else await run.ok(summary)
    return result
  } catch (e) {
    await run.fail(e)
    throw e
  }
}

/**
 * Wrap a cron route handler so every run is logged. 2xx → `ok` with the JSON
 * body as the summary; 5xx or a thrown error → `failed`; 4xx (bad/missing
 * CRON_SECRET) is not recorded — an unauthenticated probe is not a run.
 */
export function cronHandler<R extends Request>(job: string, handler: (req: R) => Promise<NextResponse>) {
  return async (req: R): Promise<NextResponse> => {
    const supabase = getSupabaseAdmin()
    const run = await startCronRun(supabase, job)
    let res: NextResponse
    try {
      res = await handler(req)
    } catch (e) {
      await run.fail(e)
      return NextResponse.json({ error: errorText(e) }, { status: 500 })
    }
    if (res.status >= 500) {
      const body = await res.clone().json().catch(() => null)
      await run.fail(body?.error ?? `HTTP ${res.status}`, body && typeof body === 'object' ? body : undefined)
    } else if (res.status < 400) {
      const body = await res.clone().json().catch(() => null)
      await run.ok(body && typeof body === 'object' ? body : undefined)
    } else if (run.id) {
      // 4xx: not a run. Drop the opened row so the log stays readable.
      await supabase.from('cron_runs').delete().eq('id', run.id)
    }
    return res
  }
}
