'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InfoPopover } from './InfoPopover'

type Assessment = {
  id: string
  title: string | null
  instrument: string | null
  assessment_date: string | null
  has_comparison: boolean
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return ''
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * "Your 360 Report" — every completed assessment, newest first, at the top of
 * the home page whenever portal_features.assessments is on (the route
 * double-checks). With no report yet it says so and points at Your documents,
 * so a participant sees where their report will land before it is uploaded.
 * "View report" opens the PDF in a tab; download is always available (no
 * setting can disable it). Identical for a coaching client and a participant.
 */
export function AssessmentCard({ bookingUrl }: { bookingUrl: string | null }) {
  const [items, setItems] = useState<Assessment[] | null>(null)

  useEffect(() => {
    fetch('/api/portal/assessments')
      .then((r) => (r.ok ? r.json() : { enabled: false, documents: [] }))
      .then((d) => setItems(d.enabled ? d.documents || [] : []))
      .catch(() => setItems([]))
  }, [])

  function talkToCoach() {
    fetch('/api/portal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'talk_to_coach_clicked' }),
    }).catch(() => {})
  }
  function viewed(id: string) {
    fetch('/api/portal/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'report_viewed', metadata: { document_id: id } }),
    }).catch(() => {})
  }

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">Your 360 report</h2>
        <InfoPopover
          label="Your 360 report"
          text="Your feedback report, always available to download. Open the chat to work through it: what your raters saw, where you and they see things differently, and what you want to do next."
        />
      </div>
      <div className="mt-3">
        {items === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">
            Your report will appear here once it has been uploaded. You can add it yourself under{' '}
            <a href="#your-documents" className="font-medium text-tlw-signal-orange hover:underline">Your documents</a>, or your coach or the portal team will add it for you.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((a, i) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className={`truncate font-medium text-tlw-navy-deep ${i === 0 ? 'text-[15px]' : 'text-[13px]'}`}>
                    {a.instrument || a.title || 'Feedback report'}
                    {i === 0 && items.length > 1 && <span className="ml-2 text-[11px] font-normal text-tlw-warm-gray">most recent</span>}
                  </p>
                  <p className="text-[12px] text-tlw-warm-gray">
                    {fmtDate(a.assessment_date)}
                    {a.has_comparison && ' · compares with your previous report'}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-3 text-[13px]">
                  <a
                    href={`/api/portal/documents/${a.id}/download?view=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => viewed(a.id)}
                    className="rounded-tlw-lg bg-tlw-signal-orange px-3 py-1.5 font-medium text-white transition-opacity hover:opacity-90"
                  >
                    View report
                  </a>
                  <a
                    href={`/api/portal/documents/${a.id}/download`}
                    onClick={() => viewed(a.id)}
                    className="font-medium text-tlw-signal-orange hover:underline"
                  >
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
        {items && items.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/portal/chat"
              className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
            >
              Work through it in the chat
            </Link>
            {bookingUrl && (
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={talkToCoach}
                className="rounded-tlw-lg border border-tlw-warm-gray/25 px-4 py-2 text-[13px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-canvas"
              >
                Talk to a coach
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
