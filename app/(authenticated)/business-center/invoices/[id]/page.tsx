'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/app/components/layout/PageHeader'
import type { InvoiceWithLines } from '@/lib/billing/types'

function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

const STATUS_STYLES: Record<string, string> = {
  draft:    'bg-tlw-canvas text-tlw-warm-gray',
  approved: 'bg-blue-50 text-blue-700',
  sent:     'bg-amber-50 text-amber-700',
  paid:     'bg-green-50 text-green-700',
  overdue:  'bg-red-50 text-red-700',
  failed:   'bg-red-100 text-red-800',
  void:     'bg-tlw-canvas text-tlw-warm-gray line-through',
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [invoice, setInvoice] = useState<InvoiceWithLines | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(`/api/billing/invoices/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInvoice(d.invoice))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  const period = invoice?.period_end
    ? new Date(invoice.period_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <>
      <PageHeader
        breadcrumb={`Business Center / ${invoice?.account?.name ?? 'Invoices'}`}
        title={period ? `Invoice · ${period}` : 'Invoice'}
        actions={
          <div className="flex items-center gap-2">
            {invoice && (
              <span className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize ${STATUS_STYLES[invoice.status] ?? ''}`}>
                {invoice.status}
              </span>
            )}
            <Link
              href="/business-center"
              className="rounded-tlw-lg border border-tlw-warm-gray/30 px-3 py-1.5 text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
            >
              ← Back
            </Link>
          </div>
        }
      />

      {loading && <div className="h-48 animate-pulse rounded-tlw-2xl bg-tlw-surface/70" />}
      {error && <p className="text-[13px] text-tlw-warm-gray">Couldn&apos;t load invoice.</p>}

      {invoice && (
        <div className="space-y-6">
          {/* Line items */}
          <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
            <div className="border-b border-tlw-warm-gray/10 px-5 py-3">
              <p className="text-[13px] font-semibold text-tlw-navy-deep">Line items</p>
            </div>
            {invoice.lines.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-tlw-warm-gray">No line items yet.</p>
            ) : (
              <div className="divide-y divide-tlw-warm-gray/10">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-tlw-espresso">{line.description}</p>
                      {line.quantity !== 1 && (
                        <p className="text-[11px] text-tlw-warm-gray">
                          {line.quantity} × {money(line.unit_amount)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[13px] font-medium text-tlw-navy-deep">
                      {money(line.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-tlw-warm-gray/10 px-5 py-3">
              <div className="flex justify-between text-[14px] font-semibold text-tlw-navy-deep">
                <span>Total</span>
                <span>{money(invoice.total)}</span>
              </div>
            </div>
          </section>

          {/* Audit trail */}
          {(invoice.approved_at || invoice.sent_at || invoice.paid_at) && (
            <section className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface px-5 py-4">
              <p className="mb-2 text-[13px] font-semibold text-tlw-navy-deep">Audit</p>
              <div className="space-y-1 text-[12px] text-tlw-warm-gray">
                {invoice.approved_at && (
                  <p>Approved by {invoice.approved_by ?? '—'} · {new Date(invoice.approved_at).toLocaleString()}</p>
                )}
                {invoice.sent_at && <p>Sent · {new Date(invoice.sent_at).toLocaleString()}</p>}
                {invoice.paid_at && <p>Paid · {new Date(invoice.paid_at).toLocaleString()}</p>}
              </div>
            </section>
          )}

          {/* Phase 3/4 actions placeholder */}
          {invoice.status === 'draft' && (
            <div className="rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-6 py-6 text-center">
              <p className="text-[13px] text-tlw-warm-gray">
                Approve and send actions coming in Phase 3/4.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
