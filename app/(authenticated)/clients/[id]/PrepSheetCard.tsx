'use client'
import { useEffect, useState } from 'react'

interface PrepSheet {
  id: string
  html: string | null
  sent_at: string
}

function formatSent(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Shows the prep sheets we've sent this client, rendered exactly as the email
 * went out (the stored HTML in a sandboxed iframe). Collapsed by default; the
 * latest expands on demand, older ones are pickable.
 */
export function PrepSheetCard({ clientId }: { clientId: string }) {
  const [sheets, setSheets] = useState<PrepSheet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/clients/${clientId}/prep-sheets`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setSheets(d?.prepSheets || []))
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true))
    return () => {
      cancelled = true
    }
  }, [clientId])

  // Nothing sent yet — don't clutter the panel.
  if (loaded && sheets.length === 0) return null

  const open = sheets.find((s) => s.id === openId) || null

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
        Prep sheets sent
      </p>
      {!loaded ? (
        <div className="h-10 animate-pulse rounded-tlw-md bg-tlw-canvas" />
      ) : (
        <div className="divide-y divide-tlw-warm-gray/10">
          {sheets.map((s) => (
            <div key={s.id} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-tlw-navy-deep">Session prep · {formatSent(s.sent_at)}</span>
                <button
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  className="shrink-0 text-[11px] font-medium text-tlw-signal-orange hover:underline"
                >
                  {openId === s.id ? 'Hide' : 'View'}
                </button>
              </div>
              {open?.id === s.id && (
                <div className="mt-2 overflow-hidden rounded-tlw-md border border-tlw-warm-gray/15">
                  {s.html ? (
                    <iframe
                      title="Prep sheet"
                      sandbox=""
                      srcDoc={s.html}
                      className="h-[520px] w-full bg-white"
                    />
                  ) : (
                    <p className="p-3 text-[12px] text-tlw-warm-gray">This prep sheet has no saved preview.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
