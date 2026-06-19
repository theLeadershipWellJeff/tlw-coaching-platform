'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'
import type { Client } from '@/lib/supabase/types'

interface AgreementRow {
  id: string
  title: string
  status: string // sent | active
  sent_at: string
  signed_at: string | null
  recording_authorized: boolean | null
  body_html: string | null
  signed_agreement_html: string | null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Coaching-agreement status for this client (migration 018). Shows none /
 * awaiting signature / active, recording authorization, the no-recording
 * compliance flag, and the Issue / View actions.
 */
export function AgreementsCard({
  client,
  reloadKey = 0,
  onIssue,
}: {
  client: Client
  reloadKey?: number
  onIssue: () => void
}) {
  const [rows, setRows] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewHtml, setViewHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/clients/${client.id}/agreements`)
      .then((r) => (r.ok ? r.json() : { agreements: [] }))
      .then((d) => !cancelled && setRows(d.agreements || []))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [client.id, reloadKey])

  const latest = rows[0]
  const status = !latest ? 'none' : latest.status // none | sent | active

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Agreement</p>
        <StatusBadge status={status} />
      </div>

      {loading ? (
        <div className="h-12 animate-pulse rounded-tlw-lg bg-tlw-canvas" />
      ) : (
        <div className="space-y-3">
          {status === 'none' && (
            <p className="text-[13px] text-tlw-warm-gray">No coaching agreement has been issued to this client yet.</p>
          )}

          {status === 'sent' && latest && (
            <div className="text-[13px] text-tlw-espresso">
              <p>Issued {fmtDate(latest.sent_at)} · {daysSince(latest.sent_at)} day{daysSince(latest.sent_at) === 1 ? '' : 's'} ago</p>
              <p className="text-tlw-warm-gray">Sent to {client.email || '—'} · awaiting signature</p>
            </div>
          )}

          {status === 'active' && latest && (
            <div className="text-[13px] text-tlw-espresso">
              <p>Issued {fmtDate(latest.sent_at)} · signed {fmtDate(latest.signed_at)}</p>
              <p className="text-tlw-warm-gray">
                Recording &amp; AI processing:{' '}
                {latest.recording_authorized === true
                  ? 'authorized'
                  : latest.recording_authorized === false
                  ? 'not authorized'
                  : 'unknown'}
              </p>
            </div>
          )}

          {/* No-recording compliance flag (the single Signal Orange instance). */}
          {status === 'active' && client.recording_authorized === false && (
            <div
              className="rounded-tlw-md px-3 py-2 text-[12px] font-medium"
              style={{ background: 'rgba(232,101,10,.10)', color: '#E8650A' }}
            >
              ⚑ No recording — client has not authorized AI processing.
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {status === 'none' ? (
              <button
                onClick={onIssue}
                className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
              >
                Issue Agreement
              </button>
            ) : (
              <>
                <button
                  onClick={() => setViewHtml(latest?.signed_agreement_html || latest?.body_html || '')}
                  className="rounded-tlw-lg border border-tlw-warm-gray/30 px-4 py-2 text-[13px] font-medium text-tlw-espresso transition-colors hover:border-tlw-warm-gray/50"
                >
                  View Agreement
                </button>
                <button onClick={onIssue} className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
                  Re-issue
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {viewHtml !== null && (
        <Modal title="Coaching agreement" onClose={() => setViewHtml(null)} width="max-w-2xl">
          <div className="max-h-[70vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: viewHtml }} />
        </Modal>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    none: { label: 'No Agreement', cls: 'bg-tlw-canvas text-tlw-warm-gray' },
    sent: { label: 'Awaiting Signature', cls: 'bg-amber-100 text-amber-800' },
    active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
  }
  const s = map[status] || map.none
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
}
