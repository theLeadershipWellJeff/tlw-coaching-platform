'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TLWLogo } from '../../components/TLWLogo'
import type { PrepContent } from '@/lib/email-template'

type Step = 'loading-notes' | 'generating' | 'edit' | 'sending' | 'sent' | 'error'

function SessionPage() {
  const params = useSearchParams()
  const router = useRouter()

  const clientName = params.get('clientName') || ''
  const clientEmail = params.get('clientEmail') || ''
  const start = params.get('start') || ''
  const duration = params.get('duration') || '55'

  const [step, setStep] = useState<Step>('loading-notes')
  const [content, setContent] = useState<PrepContent | null>(null)
  const [error, setError] = useState('')
  const [activeEdit, setActiveEdit] = useState<string | null>(null)
  const [personalNote, setPersonalNote] = useState('')
  const [sendStatus, setSendStatus] = useState('')

  useEffect(() => {
    if (clientName) run()
  }, [clientName])

  async function run() {
    // 1. Pull CA notes + Zoom summaries in parallel
    setStep('loading-notes')
    let notes: any[] = []
    let actions: any[] = []
    let zoomSummaries: any[] = []

    const notesPromise = fetch(`/api/notes?clientName=${encodeURIComponent(clientName)}`)
      .then(r => r.json())
      .catch(() => ({ notes: [], actions: [] }))

    const notesData = await notesPromise
    notes = notesData.notes || []
    actions = notesData.actions || []

    // CA note dates seed Zoom matching; the server also pulls calendar history
    const sessionTimes = notes
      .map((n: any) => n.date)
      .filter(Boolean)

    try {
      const qs = new URLSearchParams({
        clientName,
        clientEmail,
        sessionTimes: sessionTimes.join(','),
      })
      const zoomRes = await fetch(`/api/zoom-summaries?${qs.toString()}`)
      const zoomData = await zoomRes.json()
      zoomSummaries = zoomData.summaries || []
    } catch (e) {
      // Zoom is additive — continue without it
    }

    // 2. Generate content
    setStep('generating')
    try {
      const genRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, notes, actions, zoomSummaries }),
      })
      const genData = await genRes.json()
      if (genData.error) throw new Error(genData.error)
      setContent(genData.content)
      setStep('edit')
    } catch (e: any) {
      setError(e.message)
      setStep('error')
    }
  }

  async function send() {
    setStep('sending')
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail,
          clientName,
          content,
          sendIntro: false,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error('Send failed')
      setStep('sent')
    } catch (e: any) {
      setError(e.message)
      setStep('error')
    }
  }

  // Helper: make a field editable inline
  function Editable({
    value,
    onChange,
    tag = 'div',
    className = '',
    multiline = true,
    style,
  }: {
    value: string
    onChange: (v: string) => void
    tag?: keyof JSX.IntrinsicElements
    className?: string
    multiline?: boolean
    style?: React.CSSProperties
  }) {
    const ref = useRef<HTMLElement>(null)

    useEffect(() => {
      if (ref.current && ref.current.textContent !== value) {
        ref.current.textContent = value
      }
    }, [value])

    const Tag = tag as any
    return (
      <Tag
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className={`${className} relative group`}
        style={style}
        onBlur={(e: React.FocusEvent<HTMLDivElement>) => onChange(e.currentTarget.textContent || '')}
        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
          if (!multiline && e.key === 'Enter') e.preventDefault()
        }}
      />
    )
  }

  function updateCoachingPlan(i: number, field: 'title' | 'description', val: string) {
    if (!content) return
    const updated = [...content.coachingPlan]
    updated[i] = { ...updated[i], [field]: val }
    setContent({ ...content, coachingPlan: updated })
  }

  function updateExploring(i: number, field: 'title' | 'description', val: string) {
    if (!content) return
    const updated = [...content.exploring]
    updated[i] = { ...updated[i], [field]: val }
    setContent({ ...content, exploring: updated })
  }

  function updateInsight(i: number, val: string) {
    if (!content) return
    const updated = [...content.insights]
    updated[i] = val
    setContent({ ...content, insights: updated })
  }

  function updateAction(i: number, val: string) {
    if (!content) return
    const updated = [...content.actions]
    updated[i] = val
    setContent({ ...content, actions: updated })
  }

  function updateQuestion(i: number, field: 'theme' | 'question', val: string) {
    if (!content) return
    const updated = [...content.questions]
    updated[i] = { ...updated[i], [field]: val }
    setContent({ ...content, questions: updated })
  }

  // ── LOADING STATES ─────────────────────────────────────────────────────────
  if (step === 'loading-notes' || step === 'generating') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <TLWLogo size={48} light />
        <p className="text-tlw-warm-gray text-xs tracking-[4px] uppercase mt-4 mb-8">theLeadershipWell</p>
        <div className="text-center space-y-2">
          <div className="flex items-center gap-3 justify-center">
            <div className="w-2 h-2 rounded-full bg-tlw-warm-gray animate-pulse" />
            <p className="text-tlw-cream text-sm">
              {step === 'loading-notes' ? `Pulling session notes for ${clientName}…` : `Generating personalized prep content…`}
            </p>
          </div>
          <p className="text-tlw-warm-gray text-xs">This takes about 15 seconds</p>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <p className="text-red-400 mb-4">Something went wrong: {error}</p>
        <button onClick={run} className="text-tlw-cream underline text-sm">Try again</button>
        <button onClick={() => router.push('/')} className="text-tlw-warm-gray text-sm mt-2">← Back to dashboard</button>
      </div>
    )
  }

  if (step === 'sent') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <TLWLogo size={48} light />
        <h2 className="font-serif text-3xl font-light text-tlw-cream mt-6 mb-3">Sent ✓</h2>
        <p className="text-tlw-warm-gray text-sm mb-2">Session prep delivered to {clientName}</p>
        <p className="text-tlw-warm-gray text-xs mb-8">CC'd to jeff@theleadershipwell.com</p>
        <button onClick={() => router.push('/')} className="text-tlw-cream underline text-sm">← Back to dashboard</button>
      </div>
    )
  }

  if (step === 'sending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <TLWLogo size={48} light />
        <p className="text-tlw-cream mt-6">Sending to {clientEmail}…</p>
      </div>
    )
  }

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  if (!content) return null

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-tlw-navy-deep/95 backdrop-blur border-b border-tlw-warm-gray/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TLWLogo size={28} light onClick={() => router.push("/")} style={{cursor:"pointer"}} />
          <div>
            <p className="text-tlw-cream text-sm font-semibold">{clientName}</p>
            <p className="text-tlw-warm-gray text-xs">{clientEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-tlw-warm-gray text-xs hidden sm:block">Click any field to edit</span>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-xs text-tlw-warm-gray border border-tlw-warm-gray/30 rounded-lg hover:text-tlw-cream transition-colors"
          >
            ← Dashboard
          </button>
          <button
            onClick={run}
            className="px-4 py-2 text-xs text-tlw-warm-gray border border-tlw-warm-gray/30 rounded-lg hover:text-tlw-cream transition-colors"
          >
            ↻ Regenerate
          </button>
          <button
            onClick={send}
            className="px-5 py-2 text-xs font-semibold bg-tlw-navy-rich border border-tlw-warm-gray/40 text-tlw-cream rounded-lg hover:bg-tlw-navy-rich/70 transition-colors"
          >
            Send to {clientName.split(' ')[0]} →
          </button>
        </div>
      </div>

      {/* Email preview — live editable */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-[660px] mx-auto">
          <p className="text-tlw-warm-gray text-xs text-center mb-4 tracking-[3px] uppercase">Live Preview — click any section to edit</p>

          <div className="bg-white rounded-lg overflow-hidden shadow-2xl" style={{ fontFamily: "'DM Sans', sans-serif" }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(160deg,#111226 0%,#0C1940 100%)', padding: '40px 44px 30px', textAlign: 'center' }}>
              <div style={{ marginBottom: 16 }}>
                <TLWLogo size={56} light />
              </div>
              <p style={{ color: '#8B8680', fontSize: 9, letterSpacing: 5, textTransform: 'uppercase', marginBottom: 14 }}>theLeadershipWell</p>
              <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 32, fontWeight: 300, color: '#F2F2F0', marginBottom: 16, lineHeight: 1.15 }}>Your Session Preparation</p>
              <div style={{ width: 48, height: 1, background: '#8B8680', margin: '0 auto 14px' }} />
              <p style={{ color: '#8B8680', fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 6 }}>Prepared For You</p>
              <p style={{ color: '#F2F2F0', fontSize: 14, fontWeight: 500 }}>{clientName} · theLeadershipWell</p>
            </div>

            {/* Quote — editable */}
            <div style={{ background: 'rgba(17,18,38,.04)', borderTop: '1px solid #e5e0d8', borderBottom: '1px solid #e5e0d8', padding: '18px 44px', textAlign: 'center' }}>
              <Editable
                value={`"${content.quote.text}"`}
                onChange={v => setContent({ ...content, quote: { ...content.quote, text: v.replace(/[""]/g, '') } })}
                className="block"
                style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', fontSize: 15, color: '#403832', lineHeight: 1.75 }}
                tag="div"
              />
              <Editable
                value={`— ${content.quote.author}`}
                onChange={v => setContent({ ...content, quote: { ...content.quote, author: v.replace(/^—\s*/, '') } })}
                className="block mt-1"
                style={{ fontSize: 10, color: '#8B8680', letterSpacing: 2, textTransform: 'uppercase' }}
                multiline={false}
                tag="div"
              />
            </div>

            <div style={{ height: 1, margin: '20px 44px', background: 'linear-gradient(to right,transparent,rgba(139,134,128,.4),transparent)' }} />

            {/* Coaching Plan */}
            <div style={{ padding: '20px 44px' }}>
              <p style={{ fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 6 }}>Your Coaching Plan</p>
              <p style={{ fontSize: 12, color: '#8B8680', marginBottom: 16 }}>The areas we're working on together this season</p>
              {content.coachingPlan.map((item, i) => (
                <div key={i} style={{ padding: '13px 0', borderBottom: '1px solid #e5e0d8', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0C1940', textAlign: 'center', lineHeight: '32px', fontSize: 15, flexShrink: 0 }}>{item.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <Editable value={item.title} onChange={v => updateCoachingPlan(i, 'title', v)} multiline={false} style={{ fontWeight: 600, fontSize: 14, color: '#111226', display: 'block', marginBottom: 3 }} tag="div" />
                    <Editable value={item.description} onChange={v => updateCoachingPlan(i, 'description', v)} style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65, display: 'block' }} tag="div" />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, margin: '0 44px', background: '#e5e0d8' }} />

            {/* What We Have Been Exploring */}
            <div style={{ padding: '20px 44px' }}>
              <p style={{ fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 16 }}>What We Have Been Exploring</p>
              {content.exploring.map((item, i) => (
                <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid #e5e0d8', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#0C1940', textAlign: 'center', lineHeight: '26px', fontSize: 13, color: '#F2F2F0', fontFamily: 'Georgia, serif', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <Editable value={item.title} onChange={v => updateExploring(i, 'title', v)} multiline={false} style={{ fontWeight: 600, fontSize: 14, color: '#111226', display: 'block', marginBottom: 3 }} tag="div" />
                    <Editable value={item.description} onChange={v => updateExploring(i, 'description', v)} style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.65, display: 'block' }} tag="div" />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height: 1, margin: '0 44px', background: '#e5e0d8' }} />

            {/* Insights */}
            <div style={{ padding: '20px 44px' }}>
              <p style={{ fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 16 }}>Past Key Insights</p>
              {content.insights.map((ins, i) => (
                <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid #e5e0d8', display: 'flex', gap: 14 }}>
                  <span style={{ color: '#8B8680', fontSize: 12, paddingTop: 3 }}>✦</span>
                  <Editable value={ins} onChange={v => updateInsight(i, v)} style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', fontSize: 14, color: '#1f2937', lineHeight: 1.82, flex: 1, display: 'block' }} tag="div" />
                </div>
              ))}
            </div>
            <div style={{ height: 1, margin: '0 44px', background: '#e5e0d8' }} />

            {/* Actions */}
            <div style={{ padding: '20px 44px' }}>
              <p style={{ fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 6 }}>Your Action Items</p>
              <p style={{ fontSize: 12, color: '#8B8680', marginBottom: 14 }}>From our last sessions — how did these land?</p>
              {content.actions.map((act, i) => (
                <div key={i} style={{ padding: '11px 0', borderBottom: '1px solid #e5e0d8', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 16, height: 16, border: '2px solid #0C1940', borderRadius: 3, flexShrink: 0, marginTop: 3 }} />
                  <Editable value={act} onChange={v => updateAction(i, v)} style={{ fontSize: 14, color: '#1f2937', lineHeight: 1.65, flex: 1, display: 'block' }} tag="div" />
                </div>
              ))}
            </div>
            <div style={{ height: 1, margin: '0 44px', background: '#e5e0d8' }} />

            {/* Questions */}
            <div style={{ padding: '20px 44px' }}>
              <p style={{ fontSize: 9, letterSpacing: 4, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 6 }}>Three Questions to Sit With</p>
              <p style={{ fontSize: 12, color: '#8B8680', marginBottom: 16 }}>Give yourself 5 quiet minutes before we meet:</p>
              {content.questions.map((q, i) => (
                <div key={i} style={{ background: '#111226', padding: '18px 22px', margin: '10px 0', borderRadius: 6, borderLeft: '3px solid #8B8680' }}>
                  <Editable value={`Question ${i + 1} — ${q.theme}`} onChange={v => updateQuestion(i, 'theme', v.replace(/^Question \d+ — /, ''))} multiline={false} style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#8B8680', fontWeight: 700, marginBottom: 8, display: 'block' }} tag="div" />
                  <Editable value={q.question} onChange={v => updateQuestion(i, 'question', v)} style={{ fontSize: 15, color: '#F2F2F0', fontFamily: 'Cormorant Garamond, Georgia, serif', fontStyle: 'italic', lineHeight: 1.8, display: 'block' }} tag="div" />
                </div>
              ))}
            </div>

            {/* Closing */}
            <div style={{ padding: '20px 44px 34px' }}>
              <Editable value={content.closingLine} onChange={v => setContent({ ...content, closingLine: v })} style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, color: '#1f2937', lineHeight: 1.9, fontStyle: 'italic', marginBottom: 22, display: 'block' }} tag="div" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <TLWLogo size={38} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: '#111226' }}>Jeff Holmes</p>
                  <p style={{ fontSize: 12, color: '#8B8680', marginTop: 1 }}>Executive Coach · theLeadershipWell</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ background: '#111226', padding: '14px 44px', textAlign: 'center', fontSize: 11, color: '#8B8680', letterSpacing: 1 }}>
              theLeadershipWell &nbsp;·&nbsp; Confidential &nbsp;·&nbsp; Prepared for {clientName}
            </div>
          </div>

          {/* Send button below preview */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={send}
              className="px-8 py-3 bg-tlw-navy-rich border border-tlw-warm-gray/40 text-tlw-cream rounded-lg font-semibold hover:bg-tlw-navy-rich/70 transition-colors"
            >
              Send to {clientName} →
            </button>
          </div>
          <p className="text-tlw-warm-gray text-xs text-center mt-2">Also CC'd to jeff@theleadershipwell.com</p>
        </div>
      </div>
    </div>
  )
}

import { Suspense } from 'react'

export default function SessionPageWrapper() {
  return (
    <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#111226',color:'#F2F2F0'}}>Loading...</div>}>
      <SessionPage />
    </Suspense>
  )
}
