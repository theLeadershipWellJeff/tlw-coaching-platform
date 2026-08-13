'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Result = { id: string; title: string | null; session_date: string | null; snippet: string }

function fmtDate(ymd: string | null): string {
  if (!ymd) return ''
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="rounded bg-tlw-signal-orange/25 px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function SearchInner() {
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const query = (params.get('q') || '').trim()
    setQ(query)
    if (query.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    fetch(`/api/portal/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((d) => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => {
        setLoading(false)
        setSearched(true)
      })
  }, [params])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Search</p>
        <span className="w-10" />
      </div>

      <form action="/portal/search" className="mt-6">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Search your sessions…"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-4 py-2.5 text-[15px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </form>

      <div className="mt-6">
        {loading ? (
          <p className="text-[13px] text-tlw-warm-gray">Searching…</p>
        ) : searched && results.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">No sessions mention “{q}”.</p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.id} className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[14px] font-medium text-tlw-navy-deep">{r.title || 'Session'}</p>
                  <span className="shrink-0 text-[12px] text-tlw-warm-gray">{fmtDate(r.session_date)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-tlw-espresso">
                  <Highlight text={r.snippet} term={q} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function PortalSearch() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SearchInner />
    </Suspense>
  )
}
