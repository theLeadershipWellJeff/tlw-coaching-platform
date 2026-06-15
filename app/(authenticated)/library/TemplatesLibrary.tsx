'use client'
import { useCallback, useEffect, useState } from 'react'
import type { NoteTemplate } from '@/lib/supabase/types'
import { RichNoteEditor } from '../clients/[id]/RichNoteEditor'

type Editing = { id: string | null; name: string; content: string } | null

export function TemplatesLibrary() {
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load templates')
      setTemplates(data.templates || [])
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const isNew = !editing.id
      const res = await fetch(isNew ? '/api/templates' : `/api/templates/${editing.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, content: editing.content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setEditing(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleting(null)
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Template name"
            className="flex-1 border-none bg-transparent text-lg font-medium text-tlw-navy-deep outline-none placeholder:text-tlw-warm-gray/60"
            autoFocus
          />
        </div>
        <RichNoteEditor
          html={editing.content}
          onChange={(html) => setEditing((ed) => (ed ? { ...ed, content: html } : ed))}
          placeholder="Write the template — headings, lists, prompts you reuse each session…"
        />
        {error && <p className="text-[12px] text-tlw-signal-orange">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => setEditing(null)} className="text-[13px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !editing.name.trim()}
            className="rounded-tlw-lg bg-tlw-navy-rich px-4 py-2 text-[13px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Note templates</p>
        <button
          onClick={() => setEditing({ id: null, name: '', content: '' })}
          className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
        >
          + New template
        </button>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
      ) : error ? (
        <p className="text-[13px] text-tlw-signal-orange">{error}</p>
      ) : templates.length === 0 ? (
        <div className="rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 p-8 text-center">
          <p className="text-[13px] text-tlw-warm-gray">
            No templates yet. Create one and it&apos;ll appear in the note editor&apos;s Templates dropdown.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4"
            >
              <p className="truncate text-[14px] font-medium text-tlw-navy-deep">{t.name}</p>
              <div className="flex shrink-0 items-center gap-3 text-[12px] font-medium">
                <button
                  onClick={() => setEditing({ id: t.id, name: t.name, content: t.content })}
                  className="text-tlw-warm-gray hover:text-tlw-espresso"
                >
                  edit
                </button>
                {deleting === t.id ? (
                  <>
                    <button onClick={() => remove(t.id)} disabled={busy} className="text-red-600 hover:underline disabled:opacity-40">
                      confirm delete
                    </button>
                    <button onClick={() => setDeleting(null)} className="text-tlw-warm-gray hover:text-tlw-espresso">
                      cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setDeleting(t.id)} className="text-red-600 hover:underline">
                    delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
