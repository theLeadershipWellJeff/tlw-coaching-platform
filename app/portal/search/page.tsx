'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Result = {
  kind: 'session' | 'note'
  id: string
  title: string
  occurred_on: string | null
  snippet: string
}

const HL_OPEN = '[[hl]]'
const HL_CLOSE = '[[/hl]]'

function fmtDate(ymd: string | null): string {
  if (!ymd) return ''
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Render a snippet whose matches are wrapped in sentinel delimiters by the
 * search layer. Deliberately NOT dangerouslySetInnerHTML — the snippet is
 * transcript text, so it is only ever rendered as text.
 */
function Snippet({ text }: { text: string }) {
  const parts = text.split(HL_OPEN)
  return (
    <>
      {parts.map((part, i) => {
        if (i === 0) return <span key={i}>{part}</span>
        const [hit, ...rest] = part.split(HL_CLOSE)
        return (
          <span key={i}>
            <mark className="rounded bg-tlw-signal-orange/25 px-0.5">{hit}</mark>
            {rest.join(HL_CLOSE)}
          </span>
        )
      })}
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
          placeholder="Search your sessions and notes…"
          className="w-full rounded-tlw-lg border border-tlw-warm-gray/25 bg-tlw-surface px-4 py-2.5 text-[15px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
        />
      </form>

      <div className="mt-6">
        {loading ? (
          <p className="text-[13px] text-tlw-warm-gray">Searching…</p>
        ) : searched && results.length === 0 ? (
          <p className="text-[13px] text-tlw-warm-gray">
            Nothing in your sessions or notes mentions “{q}”.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <Link
                  href={r.kind === 'note' ? `/portal/notes/${r.id}` : `/portal/sessions/${r.id}`}
                  className="block rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-4 transition-colors hover:border-tlw-warm-gray/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[14px] font-medium text-tlw-navy-deep">
                      {r.title}
                    </p>
                    <span className="shrink-0 text-[12px] text-tlw-warm-gray">
                      {fmtDate(r.occurred_on)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-[1.5px] text-tlw-warm-gray">
                    {r.kind === 'note' ? 'Session notes' : 'Session'}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-tlw-espresso">
                    <Snippet text={r.snippet} />
                  </p>
                </Link>
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
