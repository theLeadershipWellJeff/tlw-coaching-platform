import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalSessionNote } from '@/lib/portal/data'

export const dynamic = 'force-dynamic'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * One set of session notes the coach sent this client — rendered as the exact
 * email they received (`communications.body_html`, migration 050).
 *
 * The stored HTML is a full email document, so it renders inside a SANDBOXED
 * iframe: no scripts run, and its email styling can't leak into the portal's.
 * The app authors this HTML itself, but the portal is the highest-security
 * surface in the product, so it gets isolated anyway. `allow-popups` +
 * `allow-top-navigation-by-user-activation` keep the action-item links working.
 */
export default async function PortalNote({ params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) redirect('/portal/login')

  const note = await loadPortalSessionNote(clientId, params.id)
  if (!note) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Session notes
        </p>
        <span className="w-10" />
      </div>

      <h1 className="mt-8 text-[22px] font-medium text-tlw-navy-deep">
        {note.subject || 'Session notes'}
      </h1>
      <p className="mt-1 text-[13px] text-tlw-warm-gray">{fmtDate(note.sent_at)}</p>

      <div className="mt-6 overflow-hidden rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
        {note.body_html ? (
          <iframe
            title={note.subject || 'Session notes'}
            srcDoc={note.body_html}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
            className="h-[70vh] w-full border-0"
          />
        ) : (
          <p className="p-6 text-[13px] text-tlw-warm-gray">
            The contents of this message are no longer available.
          </p>
        )}
      </div>
    </div>
  )
}
