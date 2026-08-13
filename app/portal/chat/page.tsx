'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type Conversation = { id: string; title: string; updated_at: string }

const SUGGESTIONS = [
  'What themes have come up across my sessions?',
  'Help me prepare for my next session.',
  'How am I tracking against my goals?',
]

export default function PortalChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState<{ filename: string; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portal/chat/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Could not read that file.')
      else setAttachment({ filename: d.filename, text: d.text })
    } catch {
      setError('Could not read that file.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  useEffect(() => {
    fetch('/api/portal/chat')
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => setConversations(d.conversations || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  function newChat() {
    setActiveId(null)
    setMessages([])
    setError('')
  }

  async function openConversation(id: string) {
    setActiveId(id)
    setError('')
    setMessages([])
    try {
      const res = await fetch(`/api/portal/chat/${id}`)
      const d = await res.json()
      if (res.ok) setMessages((d.messages || []).map((m: ChatMessage) => ({ role: m.role, content: m.content })))
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    const sentAttachment = attachment
    setInput('')
    setError('')
    setAttachment(null)
    setMessages((m) => [
      ...m,
      { role: 'user', content: sentAttachment ? `${content}\n\n📎 ${sentAttachment.filename}` : content },
    ])
    setSending(true)
    try {
      const res = await fetch('/api/portal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId, content, attachment: sentAttachment }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Something went wrong. Please try again.')
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: d.reply }])
        if (!activeId && d.conversationId) {
          setActiveId(d.conversationId)
          fetch('/api/portal/chat')
            .then((r) => (r.ok ? r.json() : { conversations: [] }))
            .then((c) => setConversations(c.conversations || []))
            .catch(() => {})
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4">
      <div className="flex items-center justify-between pb-3">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Coaching Assistant
        </p>
        <button
          onClick={newChat}
          className="text-[13px] font-medium text-tlw-signal-orange hover:underline"
        >
          + New chat
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation sidebar */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto md:block">
          {conversations.length === 0 ? (
            <p className="px-2 text-[12px] text-tlw-warm-gray/70">No past chats yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openConversation(c.id)}
                    className={`w-full truncate rounded-tlw-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                      activeId === c.id
                        ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                        : 'text-tlw-espresso hover:bg-tlw-canvas'
                    }`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Chat area */}
        <section className="flex min-h-0 flex-1 flex-col rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && !sending ? (
              <div className="mt-6 text-center">
                <p className="text-[15px] text-tlw-espresso">
                  Ask me anything about your goals or sessions.
                </p>
                <div className="mt-4 flex flex-col items-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-tlw-lg border border-tlw-warm-gray/25 px-3 py-1.5 text-[13px] text-tlw-navy-rich transition-colors hover:bg-tlw-canvas"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-tlw-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-tlw-navy-deep text-white'
                        : 'bg-tlw-canvas text-tlw-espresso'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-tlw-2xl bg-tlw-canvas px-4 py-2.5 text-[14px] text-tlw-warm-gray">
                  Thinking…
                </div>
              </div>
            )}
            {error && <p className="text-center text-[12px] text-tlw-signal-orange">{error}</p>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex flex-col gap-2 border-t border-tlw-warm-gray/15 p-3"
          >
            {attachment && (
              <div className="flex items-center gap-2 self-start rounded-tlw-md bg-tlw-canvas px-2.5 py-1 text-[12px] text-tlw-espresso">
                <span className="max-w-[240px] truncate">📎 {attachment.filename}</span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  aria-label="Remove attachment"
                  className="text-tlw-warm-gray hover:text-tlw-espresso"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.text"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach a document"
                className="shrink-0 rounded-tlw-lg border border-tlw-warm-gray/25 px-3 py-2.5 text-[14px] text-tlw-warm-gray transition-colors hover:bg-tlw-canvas disabled:opacity-50"
              >
                {uploading ? '…' : '📎'}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                rows={1}
                placeholder="Type a message…"
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-2 text-[14px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-tlw-lg bg-tlw-navy-deep px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-tlw-navy-rich disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
