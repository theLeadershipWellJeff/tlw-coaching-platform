'use client'
import { useEffect, useState } from 'react'

interface AgreementRow {
  id: string
  title: string
  status: string
  sent_at: string
  signed_at: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Coaching agreements sent to this client and whether they've signed. `signed`
 * flips automatically when the client taps "I have read and agree" in their
 * email. Read-only here — the record of signed agreements on the profile.
 */
export function AgreementsCard({ clientId, reloadKey = 0 }: { clientId: string; reloadKey?: number }) {
  const [rows, setRows] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${clientId}/agreements`)
      .then((r) => (r.ok ? r.json() : { agreements: [] }))
      .then((d) => !cancelled && setRows(d.agreements || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey])

  if (!loading && rows.length === 0) return null

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Agreements</p>
        {rows.length > 0 && (
          <span className="text-[11px] text-tlw-warm-gray">
            {rows.filter((r) => r.status === 'signed').length}/{rows.length} signed
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((a) => {
            const signed = a.status === 'signed'
            return (
              <li key={a.id} className="flex items-start gap-3">
                {signed ? (
                  <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] bg-tlw-navy-rich text-[10px] font-bold text-tlw-cream">
                    ✓
                  </span>
                ) : (
                  <span className="mt-[1px] inline-block h-4 w-4 shrink-0 rounded-[3px] border-2 border-tlw-navy-rich" />
                )}
                <div className="min-w-0">
                  <p className={`text-[13px] ${signed ? 'text-tlw-espresso' : 'text-tlw-espresso'}`}>{a.title}</p>
                  <p className="text-[11px] text-tlw-warm-gray">
                    {signed ? `signed ${fmtDate(a.signed_at)}` : `sent ${fmtDate(a.sent_at)} · awaiting signature`}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
