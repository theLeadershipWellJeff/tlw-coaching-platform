'use client'
import { useEffect, useState } from 'react'
import { InfoPopover } from './InfoPopover'

type Invoice = {
  id: string
  status: string
  total: number
  currency: string
  periodStart: string | null
  periodEnd: string | null
  sentAt: string | null
  paidAt: string | null
  payUrl: string | null
}

type Billing = {
  available: boolean
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null
  paymentMethodStatus: string
  invoices: Invoice[]
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Due',
  overdue: 'Overdue',
  failed: 'Payment failed',
  paid: 'Paid',
  approved: 'Upcoming',
}

/**
 * Billing for clients who are their own payer.
 *
 * Self-hides entirely when the API says billing isn't available — which covers
 * both "no billing account" and "coachee on an enterprise account", where the
 * company pays and the client must see nothing at all.
 */
export function BillingCard() {
  const [data, setData] = useState<Billing | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/portal/billing')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setData(d))
      .catch(() => setData({ available: false, card: null, paymentMethodStatus: 'none', invoices: [] }))
  }, [])

  async function addCard() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/portal/billing/setup-session', { method: 'POST' })
      const d = await res.json()
      if (res.ok && d.url) window.location.href = d.url
      else setError(d.error || 'Could not open the secure card form.')
    } catch {
      setError('Could not open the secure card form.')
    } finally {
      setStarting(false)
    }
  }

  if (!data || !data.available) return null

  const outstanding = data.invoices.filter((i) => i.payUrl)

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">
          Billing
        </h2>
        <InfoPopover
          label="Billing"
          text="Your invoices and payment method. Save a card to make future payments automatic — card details are entered on Stripe's secure page, never here."
        />
      </div>

      <div className="mt-3">
        {/* Payment method */}
        {data.card ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-tlw-espresso">
              {data.card.brand ? data.card.brand.toUpperCase() : 'Card'} ending {data.card.last4}
              {data.card.expMonth && data.card.expYear && (
                <span className="text-tlw-warm-gray">
                  {' '}
                  · expires {String(data.card.expMonth).padStart(2, '0')}/{data.card.expYear}
                </span>
              )}
            </p>
            <button
              onClick={addCard}
              disabled={starting}
              className="text-[12px] font-medium text-tlw-signal-orange hover:underline disabled:opacity-50"
            >
              {starting ? 'Opening…' : 'Replace card'}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-tlw-espresso">
              No card on file. Saving one makes future invoices settle automatically.
            </p>
            <button
              onClick={addCard}
              disabled={starting}
              className="mt-2 rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
            >
              {starting ? 'Opening…' : 'Save a card'}
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-tlw-signal-orange">{error}</p>}

        {outstanding.length > 0 && (
          <p className="mt-3 text-[12px] text-tlw-signal-orange">
            {outstanding.length === 1 ? 'One invoice is' : `${outstanding.length} invoices are`} awaiting
            payment.
          </p>
        )}

        {/* Invoice history */}
        {data.invoices.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-tlw-warm-gray/15 pt-3">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[13px] text-tlw-espresso">
                  {money(i.total, i.currency)}
                  <span className="text-tlw-warm-gray">
                    {' '}
                    · {STATUS_LABEL[i.status] || i.status}
                    {i.paidAt
                      ? ` ${fmtDate(i.paidAt)}`
                      : i.sentAt
                        ? ` ${fmtDate(i.sentAt)}`
                        : ''}
                  </span>
                </span>
                {i.payUrl && (
                  <a
                    href={i.payUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[12px] font-medium text-tlw-signal-orange hover:underline"
                  >
                    View &amp; pay →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
