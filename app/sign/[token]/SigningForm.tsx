'use client'
import { useState } from 'react'

const NAVY = '#0C1940'
const CREAM = '#F2F2F0'
const ESPRESSO = '#403832'
const WARM = '#8B8680'

const serif = "'Cormorant Garamond',Georgia,serif"

export function SigningForm({ token, clientName }: { token: string; clientName: string }) {
  const [recording, setRecording] = useState<null | boolean>(null)
  const [name, setName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const nameOk = name.trim().length >= 2
  const canAccept = nameOk
  const canSign = recording !== null && nameOk && accepted && !submitting

  async function sign() {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/agreements/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, recordingAuthorized: recording, typedName: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not record your signature.')
      setDone(true)
    } catch (e: any) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  if (done) {
    const first = clientName.split(' ')[0] || 'there'
    return (
      <div style={{ textAlign: 'center', padding: '28px 0 8px' }}>
        <h2 style={{ fontFamily: serif, fontSize: 26, color: '#111226', margin: '0 0 12px' }}>Thank you, {first}.</h2>
        <p style={{ fontFamily: serif, fontSize: 18, color: ESPRESSO, lineHeight: 1.6, margin: 0 }}>
          Your coaching agreement is signed and on file. You&apos;ll receive a copy via email shortly.
        </p>
        <p style={{ fontFamily: serif, fontSize: 18, color: ESPRESSO, margin: '10px 0 0' }}>We look forward to working together.</p>
      </div>
    )
  }

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px 16px',
    border: `1.5px solid ${active ? NAVY : '#d9d4cc'}`,
    borderRadius: 10,
    cursor: 'pointer',
    background: active ? 'rgba(12,25,64,.04)' : '#fff',
    marginBottom: 10,
  })

  return (
    <div style={{ marginTop: 8 }}>
      {/* AI authorization */}
      <h2 style={{ fontFamily: serif, fontSize: 19, color: '#111226', margin: '26px 0 10px' }}>Recording &amp; AI Authorization</h2>
      <label style={optionStyle(recording === true)} onClick={() => setRecording(true)}>
        <Box checked={recording === true} />
        <span style={{ fontFamily: serif, fontSize: 16, color: ESPRESSO, lineHeight: 1.5 }}>
          I authorize the recording and AI processing of my coaching sessions as described above.
        </span>
      </label>
      <label style={optionStyle(recording === false)} onClick={() => setRecording(false)}>
        <Box checked={recording === false} />
        <span style={{ fontFamily: serif, fontSize: 16, color: ESPRESSO, lineHeight: 1.5 }}>
          I do not authorize the recording and AI processing of my coaching sessions.
        </span>
      </label>

      {/* Acceptance */}
      <h2 style={{ fontFamily: serif, fontSize: 19, color: '#111226', margin: '26px 0 10px' }}>Acceptance</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={accepted}
          disabled={!canAccept}
          onClick={() => canAccept && setAccepted((v) => !v)}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: canAccept ? 'pointer' : 'not-allowed', opacity: canAccept ? 1 : 0.4 }}
        >
          <Box checked={accepted} />
        </button>
        <span style={{ fontFamily: serif, fontSize: 17, color: ESPRESSO }}>I,</span>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); if (accepted) setAccepted(false) }}
          placeholder="Type your full name"
          style={{
            fontFamily: serif,
            fontSize: 17,
            color: '#111226',
            border: 'none',
            borderBottom: '1.5px solid #b8b2a8',
            outline: 'none',
            background: 'transparent',
            minWidth: 220,
            padding: '2px 4px',
          }}
        />
        <span style={{ fontFamily: serif, fontSize: 17, color: ESPRESSO }}>, accept the terms of this Coaching Agreement.</span>
      </div>

      {error && <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#E8650A', marginTop: 16 }}>{error}</p>}

      <button
        type="button"
        onClick={sign}
        disabled={!canSign}
        style={{
          marginTop: 24,
          width: '100%',
          padding: '15px',
          borderRadius: 10,
          border: 'none',
          background: NAVY,
          color: CREAM,
          fontFamily: "'DM Sans',sans-serif",
          fontSize: 15,
          fontWeight: 600,
          cursor: canSign ? 'pointer' : 'not-allowed',
          opacity: canSign ? 1 : 0.4,
        }}
      >
        {submitting ? 'Signing…' : 'Sign Agreement'}
      </button>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: WARM, textAlign: 'center', marginTop: 10 }}>
        Select a recording option, type your name, and check the box to enable signing.
      </p>
    </div>
  )
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 5,
        border: `2px solid ${NAVY}`,
        background: checked ? NAVY : '#fff',
        color: CREAM,
        fontSize: 13,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      {checked ? '✓' : ''}
    </span>
  )
}
