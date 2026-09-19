'use client'
/**
 * "Assistant usage" — this client's portal-assistant spend this month against
 * their cap (AI cost controls, Phase 2), and the coach's EXTEND action. Reads
 * GET /api/clients/[id]/ai-budget (coach-scoped); Extend = PATCH {capUsd}.
 * Compact = one line; standard = the bar + the button.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CardSize } from '@/lib/dashboard/types'
import type { AiBudgetStatus } from '@/lib/supabase/types'
import { useWorkspaceCtx } from '../WorkspaceContext'
import { CompactSkeleton, CompactEmpty, CompactLine } from '../CompactCard'

const USD = 1_000_000
function usd(micros: number | null | undefined, digits = 2): string {
  return micros == null ? '—' : `$${(micros / USD).toFixed(digits)}`
}
function pctOf(s: AiBudgetStatus | null): number | null {
  if (!s?.client || s.client.cap == null || s.client.cap === 0) return null
  return Math.min(100, Math.round((s.client.spent / s.client.cap) * 100))
}
function resetLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function useAiBudget(clientId: string) {
  const [status, setStatus] = useState<AiBudgetStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/clients/${clientId}/ai-budget`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setUnavailable(!!d.unavailable)
        setStatus(d.status ?? null)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [clientId])
  useEffect(() => {
    load()
  }, [load])
  return { status, unavailable, loaded, reload: load, setStatus }
}

function AiUsageCompact({ clientId }: { clientId: string }) {
  const { status, unavailable, loaded } = useAiBudget(clientId)
  if (!loaded) return <CompactSkeleton />
  if (unavailable || !status) return <CompactEmpty label="Not tracked yet" />
  const pct = pctOf(status)
  const primary =
    pct == null ? `${usd(status.client?.spent ?? 0)} this month` : status.state === 'hard' ? `${pct}% — paused` : status.state === 'soft' ? `${pct}% — lighter model` : `${pct}% of monthly cap`
  return (
    <CompactLine
      primary={primary}
      sub={status.client?.cap != null ? `${usd(status.client.spent)} of ${usd(status.client.cap, 0)} · resets ${resetLabel(status.resets_on)}` : undefined}
    />
  )
}

export function AiUsageCard({ clientId }: { clientId: string }) {
  const { status, unavailable, loaded, setStatus } = useAiBudget(clientId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [custom, setCustom] = useState('')

  async function extend(capUsd: number) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/clients/${clientId}/ai-budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capUsd }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not extend the allowance.')
      setStatus(d.status)
      setCustom('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not extend the allowance.')
    } finally {
      setBusy(false)
    }
  }

  const pct = pctOf(status)
  const capUsd = status?.client?.cap != null ? Math.round(status.client.cap / USD) : null
  const suggested = capUsd != null ? capUsd + 10 : 20

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Assistant usage</p>
        {status && <span className="text-[11px] text-tlw-warm-gray">resets {resetLabel(status.resets_on)}</span>}
      </div>

      {!loaded ? (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-tlw-warm-gray/15" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-tlw-warm-gray/15" />
        </div>
      ) : unavailable || !status ? (
        <p className="text-[13px] text-tlw-warm-gray">
          Usage isn&apos;t tracked yet — apply migration <span className="font-medium">070_ai_budget_enforcement</span> in Supabase to turn this on.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[22px] font-semibold text-tlw-ink">
              {usd(status.client?.spent ?? 0)}
              {status.client?.cap != null && <span className="text-[13px] font-normal text-tlw-warm-gray"> of {usd(status.client.cap, 0)} this month</span>}
            </p>
            {status.state === 'hard' ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">paused</span>
            ) : status.state === 'soft' ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">lighter model</span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">on track</span>
            )}
          </div>
          {pct != null && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-tlw-warm-gray/15">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: status.state === 'hard' ? '#B42318' : status.state === 'soft' ? '#E8650A' : '#111226' }}
              />
            </div>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-tlw-warm-gray">
            {status.state === 'hard'
              ? 'This client has used their monthly allowance for the portal assistant. Extend it and their reflection space reopens immediately.'
              : status.state === 'soft'
                ? 'Past the soft cap: the assistant is answering on a lighter model for the rest of the month. Extend to restore the full model.'
                : 'What the portal assistant (chat + plan-your-week) has cost for this client this month.'}
          </p>
          {status.client?.cap != null && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => extend(suggested)}
                disabled={busy}
                className="inline-flex items-center rounded-tlw-lg px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#111226' }}
              >
                Extend to ${suggested} this month
              </button>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                inputMode="numeric"
                placeholder="or $"
                className="w-16 rounded-tlw-lg border border-tlw-warm-gray/25 bg-white px-2 py-1.5 text-[12px] text-tlw-ink"
              />
              <button
                onClick={() => {
                  const n = Number(custom)
                  if (Number.isInteger(n) && n > 0) extend(n)
                  else setError('Enter a whole-dollar amount.')
                }}
                disabled={busy || !custom}
                className="text-[12px] font-medium text-tlw-ink underline-offset-2 hover:underline disabled:opacity-50"
              >
                Set
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}
        </>
      )}
    </div>
  )
}

export function AiUsageBlock({ size }: { size: CardSize }) {
  const { clientId } = useWorkspaceCtx()
  if (size === 'compact') return <AiUsageCompact clientId={clientId} />
  return <AiUsageCard clientId={clientId} />
}
