'use client'
/**
 * Shared cached fetch of the coach's clients (/api/clients), reused by the
 * Roster, Up next, and Unmatched-bookings cards so they don't each hit the API.
 * Short TTL + in-flight dedupe; resize never refetches.
 */
import { useEffect, useState } from 'react'
import type { Client } from '@/lib/supabase/types'

export interface ClientsData {
  clients: Client[]
  loading: boolean
  error: string
}

const TTL_MS = 30_000
let cache: { at: number; data: Client[] } | null = null
let inflight: Promise<Client[]> | null = null

async function fetchClients(): Promise<Client[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/clients')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load clients')
    const clients = (data.clients || []) as Client[]
    cache = { at: Date.now(), data: clients }
    return clients
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useClients(): ClientsData {
  const [state, setState] = useState<ClientsData>(() =>
    cache ? { clients: cache.data, loading: false, error: '' } : { clients: [], loading: true, error: '' }
  )

  useEffect(() => {
    let active = true
    fetchClients()
      .then((clients) => active && setState({ clients, loading: false, error: '' }))
      .catch((e) => active && setState({ clients: [], loading: false, error: e.message }))
    return () => {
      active = false
    }
  }, [])

  return state
}
