'use client'
import { useEffect, useState } from 'react'
import { InfoPopover } from './InfoPopover'

type Framework = {
  slug: string
  title: string
  summary: string | null
  type: string | null
  hasPdf: boolean
}

export function FrameworksCard() {
  const [items, setItems] = useState<Framework[] | null>(null)
  const [active, setActive] = useState<Framework | null>(null)

  useEffect(() => {
    fetch('/api/portal/frameworks')
      .then((r) => (r.ok ? r.json() : { frameworks: [] }))
      .then((d) => setItems(d.frameworks || []))
      .catch(() => setItems([]))
  }, [])

  // Hide the card entirely when there are no frameworks for this client.
  if (items !== null && items.length === 0) return null

  return (
    <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">
          Your frameworks
        </h2>
        <InfoPopover
          label="Your frameworks"
          text="The models and frameworks that have come up in your coaching. Tap one for a short explanation, and open the PDF when you want to work through it or share it with your team."
        />
      </div>
      <div className="mt-3">
        {items === null ? (
          <p className="text-[13px] text-tlw-warm-gray">Loading…</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {items.map((f) => (
              <li key={f.slug}>
                <button
                  onClick={() => setActive(f)}
                  className="rounded-tlw-lg border border-tlw-warm-gray/25 px-3 py-1.5 text-[13px] font-medium text-tlw-navy-rich transition-colors hover:bg-tlw-canvas"
                >
                  {f.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tlw-navy-deep/40 p-4"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-tlw-2xl bg-tlw-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-medium text-tlw-navy-deep">{active.title}</h3>
                {active.type && (
                  <p className="mt-0.5 text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
                    {active.type}
                  </p>
                )}
              </div>
              <button
                onClick={() => setActive(null)}
                aria-label="Close"
                className="rounded-md px-1.5 py-1 text-[14px] leading-none text-tlw-warm-gray hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
              >
                ✕
              </button>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-tlw-espresso">
              {active.summary || 'A framework from your coaching work.'}
            </p>
            {active.hasPdf && (
              <a
                href={`/api/portal/frameworks/${encodeURIComponent(active.slug)}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-block rounded-tlw-lg bg-tlw-navy-deep px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-tlw-navy-rich"
              >
                Open PDF
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
