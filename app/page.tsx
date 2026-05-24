'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TLWLogo } from './components/TLWLogo'

interface Session {
  id: string
  title: string
  start: string
  clientName: string
  clientEmail: string
  duration: number
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const res = await fetch('/api/auth/session')
    const data = await res.json()
    if (data?.user) {
      setAuthed(true)
      loadSessions()
    } else {
      setAuthed(false)
      setLoading(false)
    }
  }

  async function loadSessions() {
    setLoading(true)
    try {
      const res = await fetch('/api/sessions')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <TLWLogo size={56} light />
        <p className="text-tlw-warm-gray text-xs tracking-[5px] uppercase mt-4 mb-2">theLeadershipWell</p>
        <h1 className="font-serif text-3xl font-light text-tlw-cream mb-2">Session Prep Engine</h1>
        <p className="text-tlw-warm-gray text-sm mb-10">Sign in to access your coaching dashboard</p>
        <a
          href="/api/auth/signin"
          className="px-8 py-3 bg-tlw-navy-rich border border-tlw-warm-gray/30 rounded-lg text-tlw-cream text-sm font-medium hover:bg-tlw-navy-rich/80 transition-colors"
        >
          Sign in with Google
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <TLWLogo size={40} light onClick={() => router.push("/")} style={{cursor:"pointer"}} />
        <div>
          <p className="text-tlw-warm-gray text-[9px] tracking-[4px] uppercase">theLeadershipWell</p>
          <h1 className="font-serif text-2xl font-light text-tlw-cream">Session Prep Engine</h1>
        </div>
        <div className="ml-auto">
          <a href="/api/auth/signout" className="text-tlw-warm-gray text-xs hover:text-tlw-cream transition-colors">Sign out</a>
        </div>
      </div>

      {/* Upcoming sessions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] tracking-[4px] uppercase text-tlw-warm-gray font-bold">Upcoming Sessions</p>
          <button
            onClick={loadSessions}
            className="text-xs text-tlw-warm-gray hover:text-tlw-cream transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-tlw-warm-gray text-sm py-12 text-center">Scanning your calendar...</div>
        ) : sessions.length === 0 ? (
          <div className="text-tlw-warm-gray text-sm py-12 text-center border border-tlw-warm-gray/20 rounded-lg">
            No upcoming coaching sessions found in the next 14 days.
            <br />
            <button
              onClick={() => router.push('/session/manual')}
              className="mt-4 text-tlw-cream underline text-xs"
            >
              Enter client details manually
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => (
              <div
                key={session.id}
                className="bg-tlw-navy-rich border border-tlw-navy-rich rounded-lg p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
                onClick={() => router.push(`/session/${session.id}?clientName=${encodeURIComponent(session.clientName)}&clientEmail=${encodeURIComponent(session.clientEmail)}&start=${encodeURIComponent(session.start)}&duration=${session.duration}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-tlw-cream text-base">{session.clientName}</p>
                    <p className="text-tlw-warm-gray text-xs mt-1">{session.clientEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-tlw-cream text-sm font-medium">{formatDate(session.start)}</p>
                    <p className="text-tlw-warm-gray text-xs mt-0.5">{formatTime(session.start)} · {session.duration} min</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-tlw-warm-gray text-xs truncate">{session.title}</p>
                  <span className="text-[9px] tracking-[3px] uppercase text-tlw-warm-gray group-hover:text-tlw-cream transition-colors ml-4 whitespace-nowrap">
                    Generate Prep →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual entry */}
      <div className="mt-6 text-center">
        <button
          onClick={() => router.push('/session/manual')}
          className="text-xs text-tlw-warm-gray hover:text-tlw-cream transition-colors underline"
        >
          + Enter client manually
        </button>
      </div>
    </div>
  )
}
