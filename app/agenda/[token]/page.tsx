'use client'
import { useEffect, useState } from 'react'
import { TLWLogo } from '@/app/components/TLWLogo'

type State = 'loading' | 'form' | 'done' | 'notfound'

export default function AgendaPage({ params }: { params: { token: string } }) {
  const [state, setState] = useState<State>('loading')
  const [firstName, setFirstName] = useState('there')
  const [prompts, setPrompts] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/agenda/${params.token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return
        setFirstName(d.clientFirstName || 'there')
        setPrompts(d.prompts || [])
        setAnswers((d.prompts || []).map((_: string, i: number) => d.items?.[i]?.a || ''))
        setState(d.status === 'submitted' ? 'done' : 'form')
      })
      .catch(() => !cancelled && setState('notfound'))
    return () => {
      cancelled = true
    }
  }, [params.token])

  async function submit() {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/agenda/${params.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit.')
      setState('done')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: '#DDD9D3' }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <TLWLogo size={44} />
          <p className="mt-3 text-[11px] uppercase tracking-[4px] text-tlw-warm-gray">theLeadershipWell</p>
        </div>

        <div className="rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-7 shadow-sm">
          {state === 'loading' && <div className="h-40 animate-pulse rounded-tlw-lg bg-tlw-canvas" />}

          {state === 'notfound' && (
            <p className="py-8 text-center text-[14px] text-tlw-espresso">
              This link isn&apos;t valid anymore. If you think that&apos;s a mistake, reply to your prep email.
            </p>
          )}

          {state === 'done' && (
            <div className="py-6 text-center">
              <p className="text-2xl">✓</p>
              <h1 className="mt-2 font-serif text-2xl font-light text-tlw-navy-deep">Thank you</h1>
              <p className="mt-2 text-[14px] text-tlw-warm-gray">
                Your agenda is in — Jeff will have it ready for your session.
              </p>
            </div>
          )}

          {state === 'form' && (
            <>
              <h1 className="font-serif text-2xl font-light text-tlw-navy-deep">Shape our agenda, {firstName}</h1>
              <p className="mt-1 text-[13px] text-tlw-warm-gray">
                A couple of quick prompts so we make the most of our time. Answer whichever feel relevant.
              </p>
              <div className="mt-5 space-y-4">
                {prompts.map((q, i) => (
                  <div key={i}>
                    <label className="mb-1.5 block text-[13px] font-medium text-tlw-navy-deep">{q}</label>
                    <textarea
                      value={answers[i] || ''}
                      onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                      rows={3}
                      className="w-full rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface p-3 text-[14px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange"
                    />
                  </div>
                ))}
              </div>
              {error && <p className="mt-3 text-[13px] text-tlw-signal-orange">{error}</p>}
              <button
                onClick={submit}
                disabled={submitting}
                className="mt-5 w-full rounded-tlw-lg bg-tlw-navy-rich px-4 py-3 text-[14px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? 'Sending…' : 'Send my agenda'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
