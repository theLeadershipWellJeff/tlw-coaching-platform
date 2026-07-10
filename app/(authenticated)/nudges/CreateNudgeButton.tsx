'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/shared/Modal'
import { CreateNudgeModal } from '../clients/[id]/CreateNudgeModal'

type ClientOption = { id: string; name: string; status?: string }

/**
 * "+ Create nudge" on the cross-client queue. The per-client workspace already
 * has CreateNudgeModal; here the coach first picks which client the nudge is
 * for (working clients only — the roster's Active-tab definition), then the
 * same modal takes over.
 */
export function CreateNudgeButton({ onCreated }: { onCreated: () => void }) {
  const [picking, setPicking] = useState(false)
  const [clients, setClients] = useState<ClientOption[] | null>(null)
  const [picked, setPicked] = useState<ClientOption | null>(null)

  useEffect(() => {
    if (!picking || clients !== null) return
    let cancelled = false
    fetch('/api/clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((d) => {
        if (cancelled) return
        const working = ((d.clients || []) as ClientOption[]).filter(
          (c) => c.status !== 'inactive' && c.status !== 'archived'
        )
        setClients(working)
      })
      .catch(() => !cancelled && setClients([]))
    return () => {
      cancelled = true
    }
  }, [picking, clients])

  return (
    <>
      <button
        onClick={() => setPicking(true)}
        className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
      >
        + Create nudge
      </button>

      {picking && !picked && (
        <Modal title="Who is this nudge for?" onClose={() => setPicking(false)}>
          {clients === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 animate-pulse rounded-tlw-md bg-tlw-canvas" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-tlw-warm-gray">No active clients on the roster.</p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setPicked(c)}
                  className="block w-full rounded-tlw-md px-3 py-2 text-left text-[13px] text-tlw-espresso transition-colors hover:bg-tlw-canvas"
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      {picked && (
        <CreateNudgeModal
          clientId={picked.id}
          clientName={picked.name}
          onClose={() => {
            setPicked(null)
            setPicking(false)
          }}
          onCreated={onCreated}
        />
      )}
    </>
  )
}
