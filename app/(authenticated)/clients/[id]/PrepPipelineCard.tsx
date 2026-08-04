'use client'
import { useCallback, useEffect, useState } from 'react'
import { PrepSheetItem, type PrepSheetRow } from '../../prep/PrepSheetItem'

/**
 * Workspace card: the pipeline prep sheet(s) for this client — the upcoming
 * session's draft/scheduled sheet with the same review actions as the /prep
 * queue, scoped to this client. Hidden when there's nothing in flight.
 */
export function PrepPipelineCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<PrepSheetRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/prep-pipeline`)
      const data = res.ok ? await res.json() : null
      setRows(data?.prepSheets || [])
    } catch {
      /* ignore */
    } finally {
      setLoaded(true)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  // Show the actionable ones prominently; hide the card entirely if nothing is
  // in flight (sent/skipped-only history stays on the /prep queue).
  const active = rows.filter((r) => r.status === 'draft' || r.status === 'approved' || r.status === 'failed')
  if (loaded && active.length === 0) return null

  return (
    <div className="rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-tlw-warm-gray">
        Prep sheet — upcoming session
      </p>
      {!loaded ? (
        <div className="h-10 animate-pulse rounded-tlw-md bg-tlw-canvas" />
      ) : (
        <div className="space-y-3">
          {active.map((r) => (
            <PrepSheetItem key={r.id} sheet={r} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  )
}
