/**
 * Invoice links that remember where the coach came from. A surface that links
 * into an invoice passes its own path as `from`; the invoice page's back link
 * (and its post-delete redirect) return there instead of the Invoices list.
 */

const DEFAULT_BACK = '/business-center/invoices'

/** Only same-app absolute paths — never `//host` or a full URL (open redirect). */
export function safeBackPath(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return DEFAULT_BACK
  return from
}

export function invoiceHref(id: string, from?: string): string {
  const base = `/business-center/invoices/${id}`
  return from ? `${base}?from=${encodeURIComponent(from)}` : base
}

/** Label for the back link, from the path it returns to. */
export function backLabelFor(path: string): string {
  const p = path.split('?')[0]
  if (p === '/business-center') return 'Business Center'
  if (p === '/business-center/run') return 'Billing run'
  if (p.startsWith('/business-center/accounts/')) return 'Account'
  if (p === '/business-center/accounts') return 'Accounts'
  return 'Invoices'
}
