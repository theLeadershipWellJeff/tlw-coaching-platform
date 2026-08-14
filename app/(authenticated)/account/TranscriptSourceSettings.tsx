'use client'
import { useEffect, useState } from 'react'

// Where a coach's session recordings/transcripts come from. Manual upload is
// live today (the per-client "+ Import" flow); Plaud and Zoom automated intake
// are post-beta — selecting them records the coach's intent and surfaces setup
// guidance, while manual upload keeps working for everyone regardless.
// NOTE: swap PLAUD_SIGNUP_URL for the affiliate/discount link when it exists.
const PLAUD_SIGNUP_URL = 'https://www.plaud.ai'

type SourceKey = 'manual' | 'plaud' | 'zoom'

const SOURCES: {
  key: SourceKey
  label: string
  blurb: string
  status: 'live' | 'coming'
}[] = [
  {
    key: 'manual',
    label: 'Manual upload',
    blurb: 'Upload transcript files (md, txt, vtt, srt, docx, pdf) from a client’s workspace — the "+ Import" button on the Transcripts card. Works today, no setup.',
    status: 'live',
  },
  {
    key: 'plaud',
    label: 'Plaud recorder',
    blurb: 'A Plaud.ai device records your sessions and produces speaker-separated transcripts. Automated delivery into the app is coming soon — until then, upload the transcript files manually.',
    status: 'coming',
  },
  {
    key: 'zoom',
    label: 'Zoom recordings',
    blurb: 'Pull transcripts from your Zoom cloud recordings automatically. Coming soon — until then, download the transcript from Zoom and upload it manually.',
    status: 'coming',
  },
]

/** Account → Transcript source. */
export function TranscriptSourceSettings() {
  const [selected, setSelected] = useState<SourceKey>('manual')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const src = d?.coach?.transcript_source
        if (src === 'manual' || src === 'plaud' || src === 'zoom') setSelected(src)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save(next: SourceKey) {
    setSelected(next)
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/coach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptSource: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMsg({ ok: true, text: 'Saved.' })
      else setMsg({ ok: false, text: data.error || 'Could not save.' })
    } catch {
      setMsg({ ok: false, text: 'Network error while saving.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-6">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Transcript source</p>
      <p className="mb-4 text-[13px] text-tlw-warm-gray">
        How your session recordings become transcripts for scoring. Manual upload works for every
        option today; automated delivery from Plaud and Zoom is on the way.
      </p>

      <div className="space-y-2">
        {SOURCES.map((s) => (
          <label
            key={s.key}
            className={`flex cursor-pointer items-start gap-3 rounded-tlw-md border p-3 transition-colors ${
              selected === s.key ? 'border-tlw-navy-deep/40 bg-white' : 'border-tlw-warm-gray/20 bg-white/60 hover:bg-white'
            }`}
          >
            <input
              type="radio"
              name="transcript-source"
              checked={selected === s.key}
              onChange={() => save(s.key)}
              disabled={!loaded || saving}
              className="mt-0.5"
            />
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-tlw-navy-deep">{s.label}</span>
                {s.status === 'coming' && (
                  <span className="rounded-full bg-tlw-warm-gray/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-tlw-warm-gray">
                    automated intake coming soon
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-tlw-warm-gray">{s.blurb}</span>
              {s.key === 'plaud' && (
                <a
                  href={PLAUD_SIGNUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[12px] font-medium text-tlw-navy-deep hover:underline"
                >
                  Get a Plaud recorder →
                </a>
              )}
            </span>
          </label>
        ))}
      </div>

      {msg && (
        <p className="mt-2 text-[12px]" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {msg.text}
        </p>
      )}
    </div>
  )
}
