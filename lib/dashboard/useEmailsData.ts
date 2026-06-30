'use client'
/**
 * Shared data hook for the Emails Sent card — one fetch of the coach's outbound
 * communications log (cross-client). Short module cache + in-flight dedupe so
 * resizing never refetches (brief §3.2).
 */
import { useEffect, useState } from 'react'

export interface EmailItem {
  id: string
  clientId: string | null
  clientName: string
  type: string
  subject: string | null
  preview: string | null
  status: string
  gmailMessageId: string | null
  sentAt: string
}

export interface EmailsPayload {
  weekCount: number
  items: EmailItem[]
}

export interface EmailsData {
  loading: boolean
  error: boolean
  emails: EmailsPayload | null
}

const TTL_MS = 30_000
let cache: { at: number; data: EmailsPayload } | null = null
let inflight: Promise<EmailsPayload> | null = null

async function fetchEmails(): Promise<EmailsPayload> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch('/api/dashboard/communications')
    if (!res.ok) throw new Error('Failed to load emails')
    const data = (await res.json()) as EmailsPayload
    cache = { at: Date.now(), data }
    return data
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function useEmailsData(): EmailsData {
  const [state, setState] = useState<EmailsData>(() =>
    cache ? { loading: false, error: false, emails: cache.data } : { loading: true, error: false, emails: null }
  )

  useEffect(() => {
    let active = true
    fetchEmails()
      .then((emails) => active && setState({ loading: false, error: false, emails }))
      .catch(() => active && setState({ loading: false, error: true, emails: null }))
    return () => {
      active = false
    }
  }, [])

  return state
}
