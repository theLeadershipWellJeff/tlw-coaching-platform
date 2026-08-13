'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function PortalLogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/portal/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    router.replace('/portal/login')
  }
  return (
    <button
      onClick={logout}
      disabled={busy}
      className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso disabled:opacity-50"
    >
      Sign out
    </button>
  )
}
