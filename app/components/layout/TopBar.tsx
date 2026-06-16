'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SearchResult {
  type: 'client' | 'note'
  id: string
  title: string
  subtitle: string | null
  href: string
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [name, setName] = useState('')
  const [initials, setInitials] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)

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

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  // Debounced search as the query changes.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d) => {
          if (cancelled) return
          setResults(d.results || [])
          setActive(0)
          setOpen(true)
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  function go(r: SearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])
    router.push(r.href)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[active]
      if (r) go(r)
    }
  }

  const showDropdown = open && query.trim().length >= 2

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-tlw-warm-gray/15 bg-tlw-surface px-6">
      <div ref={boxRef} className="relative w-full max-w-md">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search clients, notes…"
          className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas py-2 pl-3 pr-12 text-[13px] text-tlw-espresso placeholder:text-tlw-warm-gray focus:border-tlw-navy-rich focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-tlw-sm border border-tlw-warm-gray/25 px-1.5 py-0.5 text-[10px] font-medium text-tlw-warm-gray">
          ⌘K
        </kbd>

        {showDropdown && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface shadow-lg">
            {loading && results.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-tlw-warm-gray">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-[12px] text-tlw-warm-gray">No matches.</p>
            ) : (
              <ul className="max-h-80 overflow-auto py-1">
                {results.map((r, i) => (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        go(r)
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === active ? 'bg-tlw-canvas' : 'hover:bg-tlw-canvas/60'
                      }`}
                    >
                      <span className="shrink-0 rounded-full bg-tlw-navy-rich/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tlw-navy-rich">
                        {r.type}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-tlw-espresso">{r.title}</span>
                        {r.subtitle && (
                          <span className="block truncate text-[11px] text-tlw-warm-gray">{r.subtitle}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
