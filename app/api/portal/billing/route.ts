import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { resolvePortalBillingAccount, loadPortalInvoices } from '@/lib/portal/billing'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * This client's billing summary: the card on file (if any) and their invoice
 * history.
 *
 * Returns `{ available: false }` — not an error — when the client has no billing
 * account or is a coachee on an ENTERPRISE account, where the company is the
 * payer and the client must see nothing. The card self-hides on that response.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await resolvePortalBillingAccount(clientId)
  if (!account) return NextResponse.json({ available: false })

  const invoices = await loadPortalInvoices(account.id)
  const base = getBaseUrl()

  return NextResponse.json({
    available: true,
    card:
      account.paymentMethodStatus === 'active'
        ? {
            brand: account.paymentMethodBrand,
            last4: account.paymentMethodLast4,
            expMonth: account.paymentMethodExpMonth,
            expYear: account.paymentMethodExpYear,
          }
        : null,
    paymentMethodStatus: account.paymentMethodStatus ?? 'none',
    invoices: invoices.map((i) => ({
      ...i,
      // The tracked link is a credential, so hand back the full URL rather than
      // the bare token and let the client follow it.
      payUrl: i.payToken ? `${base}/api/billing/invoices/receipt/${i.payToken}` : null,
      payToken: undefined,
    })),
  })
}
