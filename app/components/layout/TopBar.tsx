'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [name, setName] = useState('')
  const [initials, setInitials] = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        const n: string = d?.user?.name || d?.user?.email || ''
        setName(n)
        setInitials(computeInitials(n))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-tlw-warm-gray/15 bg-tlw-surface px-6">
      <div className="relative w-full max-w-md">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search clients, sessions, notes…"
          className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas py-2 pl-3 pr-12 text-[13px] text-tlw-espresso placeholder:text-tlw-warm-gray focus:border-tlw-navy-rich focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-tlw-sm border border-tlw-warm-gray/25 px-1.5 py-0.5 text-[10px] font-medium text-tlw-warm-gray">
          ⌘K
        </kbd>
      </div>

      <button
        onClick={() => router.push('/account')}
        title={name || 'Account'}
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-tlw-navy-rich text-[12px] font-semibold text-tlw-cream transition-opacity duration-tlw-base hover:opacity-90"
      >
        {initials || '·'}
      </button>
    </header>
  )
}
