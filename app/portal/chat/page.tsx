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
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [attachment, setAttachment] = useState<{ filename: string; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function refreshConversations() {
    try {
      const res = await fetch('/api/portal/chat')
      const d = res.ok ? await res.json() : { conversations: [] }
      setConversations(d.conversations || [])
    } catch {
      /* ignore */
    }
  }

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
    refreshConversations()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  function newChat() {
    setActiveId(null)
    setMessages([])
    setError('')
    setSidebarOpen(false)
  }

  async function openConversation(id: string) {
    setActiveId(id)
    setError('')
    setMessages([])
    setSidebarOpen(false)
    try {
      const res = await fetch(`/api/portal/chat/${id}`)
      const d = await res.json()
      if (res.ok) setMessages((d.messages || []).map((m: ChatMessage) => ({ role: m.role, content: m.content })))
    } catch {
      /* ignore */
    }
  }

  async function renameConversation(id: string, current: string) {
    setMenuFor(null)
    const title = window.prompt('Rename this conversation', current)?.trim()
    if (!title || title === current) return
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)))
    try {
      await fetch(`/api/portal/chat/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    } catch {
      refreshConversations()
    }
  }

  async function deleteConversation(id: string) {
    setMenuFor(null)
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return
    setConversations((cs) => cs.filter((c) => c.id !== id))
    if (activeId === id) newChat()
    try {
      await fetch(`/api/portal/chat/${id}`, { method: 'DELETE' })
    } catch {
      refreshConversations()
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

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Something went wrong. Please try again.')
        return
      }

      // Adopt the conversation id straight from the header, so a brand-new thread
      // is addressable before the reply finishes streaming.
      const newId = res.headers.get('X-Conversation-Id')
      const isNew = !activeId && newId
      if (newId && !activeId) setActiveId(newId)

      // Render the reply as it arrives rather than after the whole call.
      setStreaming(true)
      setMessages((m) => [...m, { role: 'assistant', content: '' }])
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((m) => {
          const next = [...m]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      }
      if (isNew) refreshConversations()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSending(false)
      setStreaming(false)
    }
  }

  const sidebar = (
    <>
      <button
        onClick={newChat}
        className="mb-2 w-full rounded-tlw-lg border border-tlw-warm-gray/25 px-2.5 py-1.5 text-left text-[13px] font-medium text-tlw-signal-orange hover:bg-tlw-canvas"
      >
        + New chat
      </button>
      {conversations.length === 0 ? (
        <p className="px-2 text-[12px] text-tlw-warm-gray/70">No past chats yet.</p>
      ) : (
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id} className="group relative">
              <button
                onClick={() => openConversation(c.id)}
                className={`w-full truncate rounded-tlw-md py-1.5 pl-2.5 pr-7 text-left text-[13px] transition-colors ${
                  activeId === c.id
                    ? 'bg-tlw-navy-rich/10 text-tlw-navy-rich'
                    : 'text-tlw-espresso hover:bg-tlw-canvas'
                }`}
              >
                {c.title}
              </button>
              <button
                onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                aria-label={`Options for ${c.title}`}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[13px] leading-none text-tlw-warm-gray hover:bg-tlw-warm-gray/15 hover:text-tlw-espresso"
              >
                ⋯
              </button>
              {menuFor === c.id && (
                <div className="absolute right-1 top-8 z-10 w-32 overflow-hidden rounded-tlw-md border border-tlw-warm-gray/20 bg-tlw-surface shadow-lg">
                  <button
                    onClick={() => renameConversation(c.id, c.title)}
                    className="block w-full px-3 py-2 text-left text-[12px] text-tlw-espresso hover:bg-tlw-canvas"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => deleteConversation(c.id)}
                    className="block w-full px-3 py-2 text-left text-[12px] text-tlw-signal-orange hover:bg-tlw-canvas"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )

  return (
    <div className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4">
      <div className="flex items-center justify-between pb-3">
        <Link href="/portal" className="text-[13px] font-medium text-tlw-warm-gray hover:text-tlw-espresso">
          ← Back
        </Link>
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          Coaching Assistant
        </p>
        {/* On a phone the sidebar is a drawer, so past chats stay reachable. */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="text-[13px] font-medium text-tlw-signal-orange hover:underline md:hidden"
        >
          {sidebarOpen ? 'Close' : 'Chats'}
        </button>
        <button onClick={newChat} className="hidden text-[13px] font-medium text-tlw-signal-orange hover:underline md:block">
          + New chat
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation sidebar — inline on desktop, drawer on mobile */}
        <aside className="hidden w-52 shrink-0 overflow-y-auto md:block">{sidebar}</aside>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden" role="dialog" aria-modal="true">
            <div className="flex-1 bg-tlw-navy-deep/40" onClick={() => setSidebarOpen(false)} />
            <div className="w-64 overflow-y-auto bg-tlw-surface p-3 shadow-xl">{sidebar}</div>
          </div>
        )}

        {/* Chat area */}
        <section className="flex min-h-0 flex-1 flex-col rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && !sending ? (
              <div className="mt-6 text-center">
                <p className="text-[15px] text-tlw-espresso">
                  Ask me anything about your goals, sessions, or the notes your coach sent you.
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
                    {/* Caret on the streaming reply, so it reads as live typing. */}
                    {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                      <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-tlw-warm-gray align-middle" />
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && !streaming && (
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
