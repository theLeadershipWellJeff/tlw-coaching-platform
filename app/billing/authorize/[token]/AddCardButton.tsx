'use client'

import { useState } from 'react'

export function AddCardButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/billing/authorize/${token}/session`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start card setup. Please contact your coach.')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <button
        onClick={start}
        disabled={loading}
        style={{
          display: 'inline-block',
          background: '#111226',
          color: '#fff',
          border: 'none',
          padding: '14px 28px',
          borderRadius: 8,
          fontSize: 15,
          fontFamily: "'DM Sans',sans-serif",
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Opening secure page…' : 'Store my card securely'}
      </button>
      {error && <p style={{ marginTop: 14, color: '#b4231f', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>{error}</p>}
    </div>
  )
}
