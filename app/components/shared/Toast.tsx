'use client'
/**
 * Minimal app toast. `showToast('Sent to Maria')` from anywhere; `ToastHost`
 * (mounted once in the authenticated layout) renders it for ~4 s. Survives a
 * router.push because the host lives above the pages.
 */
import { useEffect, useState } from 'react'

const EVENT = 'tlw-toast'
const PENDING_KEY = 'tlw-toast-pending'

export function showToast(message: string) {
  try {
    // Also stash it: a toast fired right before a navigation must survive the
    // page swap even if the host is remounting.
    sessionStorage.setItem(PENDING_KEY, message)
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    function show(m: string) {
      setMsg(m)
      try {
        sessionStorage.removeItem(PENDING_KEY)
      } catch {}
    }
    function onEvent(e: Event) {
      show((e as CustomEvent<string>).detail)
    }
    window.addEventListener(EVENT, onEvent)
    try {
      const pending = sessionStorage.getItem(PENDING_KEY)
      if (pending) show(pending)
    } catch {}
    return () => window.removeEventListener(EVENT, onEvent)
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  if (!msg) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div className="pointer-events-auto rounded-tlw-xl border border-tlw-warm-gray/20 bg-tlw-navy-deep px-4 py-2.5 text-[13px] font-medium text-tlw-cream shadow-lg">
        {msg}
      </div>
    </div>
  )
}
