import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalTranscript } from '@/lib/portal/data'

export const dynamic = 'force-dynamic'

function fmtDate(ymd: string | null): string {
  if (!ymd) return ''
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * A single session transcript, readable in the portal. The load is scoped to the
 * authenticated client, so an id belonging to someone else 404s rather than
 * revealing that it exists.
 */
export default async function PortalSession({ params }: { params: { id: string } }) {
  const clientId = await getPortalClientId()
  if (!clientId) redirect('/portal/login')

  const transcript = await loadPortalTranscript(clientId, params.id)
  if (!transcript) notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Session</p>
        <span className="w-10" />
      </div>

      <h1 className="mt-8 text-[22px] font-medium text-tlw-navy-deep">
        {transcript.title || 'Session'}
      </h1>
      {transcript.session_date && (
        <p className="mt-1 text-[13px] text-tlw-warm-gray">{fmtDate(transcript.session_date)}</p>
      )}

      <div className="mt-6 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
        {transcript.raw_md.trim() ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-tlw-espresso">
            {transcript.raw_md}
          </pre>
        ) : (
          <p className="text-[13px] text-tlw-warm-gray">This session has no transcript on file.</p>
        )}
      </div>
    </div>
  )
}
