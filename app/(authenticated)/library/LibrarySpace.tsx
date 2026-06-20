'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderTemplates } from './FolderTemplates'
import { FolderPdfs } from './FolderPdfs'

type Section = 'templates' | 'pdf'
type Folder = { id: string; name: string; kind: string; count: number }
type OpenFolder = { id: string; name: string; kind: string }
type Labels = Record<string, string>

// Built-in defaults for the fixed Library nodes; a coach can override each label
// (migration 019, stored on coaches.library_labels and applied here).
const DEFAULT_LABELS: Record<string, string> = {
  templates: 'Templates',
  pdf: 'PDF Resources',
  agreement: 'Coaching Agreement',
  unfiled: 'Unfiled',
}

// Quick-add folders: label → kind.
const TEMPLATE_SUGGESTIONS: { label: string; kind: string }[] = [
  { label: 'Note', kind: 'note' },
  { label: 'Worksheets', kind: 'worksheet' },
  { label: 'Agreements', kind: 'agreement' },
]
const KIND_LABEL: Record<string, string> = { agreement: 'Agreements', worksheet: 'Worksheets' }

export function LibrarySpace() {
  const router = useRouter()
  const [section, setSection] = useState<Section | null>(null)
  const [folder, setFolder] = useState<OpenFolder | null>(null)
  const [labels, setLabels] = useState<Labels>({})

  useEffect(() => {
    let cancelled = false
    fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : { coach: {} }))
      .then((d) => !cancelled && setLabels(d.coach?.library_labels || {}))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const labelFor = useCallback(
    (key: string) => (labels[key]?.trim() ? labels[key] : DEFAULT_LABELS[key]),
    [labels]
  )

  // Persist a custom label (empty resets to the built-in default).
  const saveLabel = useCallback(async (key: string, value: string) => {
    const res = await fetch('/api/coach', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryLabels: { [key]: value } }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Could not rename.')
    setLabels(data.library_labels || {})
  }, [])

  // Breadcrumb
  const crumb = (
    <div className="mb-5 flex items-center gap-1.5 text-[13px] text-tlw-warm-gray">
      <button onClick={() => { setSection(null); setFolder(null) }} className="hover:text-tlw-espresso">
        Library
      </button>
      {section && (
        <>
          <span>/</span>
          <button onClick={() => setFolder(null)} className="hover:text-tlw-espresso">
            {labelFor(section)}
          </button>
        </>
      )}
      {folder && (
        <>
          <span>/</span>
          <span className="font-medium text-tlw-navy-deep">{folder.name}</span>
        </>
      )}
    </div>
  )

  // Level 0 — pick a section.
  if (!section) {
    return (
      <div>
        {crumb}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HomeNode
            label={labelFor('templates')}
            description="Note and worksheet templates — organized in folders."
            onOpen={() => setSection('templates')}
            onSave={(v) => saveLabel('templates', v)}
          />
          <HomeNode
            label={labelFor('pdf')}
            description="Upload and organize PDF files in folders."
            onOpen={() => setSection('pdf')}
            onSave={(v) => saveLabel('pdf', v)}
          />
        </div>
        <div className="mt-4">
          <HomeNode
            label={labelFor('agreement')}
            description="Edit the master coaching agreement sent to all clients. Issue it to a client from their profile."
            onOpen={() => router.push('/library/agreement')}
            onSave={(v) => saveLabel('agreement', v)}
          />
        </div>
      </div>
    )
  }

  // Level 2 — inside a folder.
  if (folder) {
    return (
      <div>
        {crumb}
        {section === 'templates' ? (
          <FolderTemplates folderId={folder.id} kind={folder.kind} />
        ) : (
          <FolderPdfs folderId={folder.id} />
        )}
      </div>
    )
  }

  // Level 1 — folders in the section.
  return (
    <div>
      {crumb}
      <FolderList
        section={section}
        sectionLabel={labelFor(section)}
        unfiledLabel={labelFor('unfiled')}
        onRenameUnfiled={(v) => saveLabel('unfiled', v)}
        onOpen={setFolder}
      />
    </div>
  )
}

/**
 * A fixed Library home node (a section tile or the agreement card) with an inline
 * rename. Clicking the body opens it; the pencil renames it (per-coach label).
 */
function HomeNode({
  label,
  description,
  onOpen,
  onSave,
}: {
  label: string
  description: string
  onOpen: () => void
  onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch {
      /* surfaced inline elsewhere; keep the editor open */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-6 transition-colors hover:border-tlw-warm-gray/35">
      {editing ? (
        <div className="flex items-center gap-2">
          <FolderIcon />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setEditing(false); setDraft(label) }
            }}
            autoFocus
            placeholder={label}
            className="min-w-0 flex-1 border-b border-tlw-warm-gray/30 bg-transparent text-[15px] font-medium text-tlw-navy-deep outline-none"
          />
          <button onClick={save} disabled={busy} className="text-[12px] font-medium text-tlw-navy-rich hover:underline disabled:opacity-40">
            save
          </button>
          <button onClick={() => { setEditing(false); setDraft(label) }} className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
            cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => { setEditing(true); setDraft(label) }}
            title="Rename"
            aria-label="Rename"
            className="absolute right-3 top-3 text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
          >
            <PencilIcon />
          </button>
          <button onClick={onOpen} className="block w-full text-left">
            <div className="mb-2 flex items-center gap-2">
              <FolderIcon />
              <p className="text-[15px] font-medium text-tlw-navy-deep">{label}</p>
            </div>
            <p className="pr-6 text-[13px] text-tlw-warm-gray">{description}</p>
          </button>
        </>
      )}
    </div>
  )
}

function FolderList({
  section,
  sectionLabel,
  unfiledLabel,
  onRenameUnfiled,
  onOpen,
}: {
  section: Section
  sectionLabel: string
  unfiledLabel: string
  onRenameUnfiled: (value: string) => Promise<void>
  onOpen: (f: OpenFolder) => void
}) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [unfiled, setUnfiled] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [newKind, setNewKind] = useState('note')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingUnfiled, setRenamingUnfiled] = useState(false)
  const [unfiledDraft, setUnfiledDraft] = useState(unfiledLabel)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/library/folders?section=${section}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load folders')
      setFolders(data.folders || [])
      if (section === 'templates') {
        const u = await fetch('/api/templates?folderId=none').then((r) => (r.ok ? r.json() : { templates: [] }))
        setUnfiled((u.templates || []).length)
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [section])

  useEffect(() => {
    load()
  }, [load])

  async function create(folderName: string, kind = 'note') {
    const trimmed = folderName.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/library/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, name: trimmed, kind }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create folder')
      setName('')
      setAdding(false)
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
      const res = await fetch(`/api/library/folders/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleting(null)
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  async function rename(id: string) {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/library/folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not rename folder')
      setRenaming(null)
      setRenameValue('')
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveUnfiled() {
    setBusy(true)
    setError('')
    try {
      await onRenameUnfiled(unfiledDraft.trim())
      setRenamingUnfiled(false)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">{sectionLabel} folders</p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-tlw-lg bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90"
          >
            + New folder
          </button>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create(name, newKind)}
            placeholder="Folder name"
            autoFocus
            className="flex-1 border-none bg-transparent text-[14px] text-tlw-navy-deep outline-none placeholder:text-tlw-warm-gray/60"
          />
          {section === 'templates' && (
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              className="rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-surface px-2 py-1.5 text-[12px] text-tlw-espresso outline-none focus:border-tlw-signal-orange"
            >
              <option value="note">Note templates</option>
              <option value="agreement">Agreements</option>
              <option value="worksheet">Worksheets</option>
            </select>
          )}
          <button onClick={() => { setAdding(false); setName('') }} className="text-[12px] text-tlw-warm-gray hover:text-tlw-espresso">
            Cancel
          </button>
          <button
            onClick={() => create(name, newKind)}
            disabled={busy || !name.trim()}
            className="rounded-tlw-md bg-tlw-navy-rich px-3 py-1.5 text-[12px] font-medium text-tlw-cream transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      )}

      {error && <p className="text-[13px] text-tlw-signal-orange">{error}</p>}

      {loading ? (
        <div className="h-24 animate-pulse rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface/60" />
      ) : folders.length === 0 && unfiled === 0 ? (
        <div className="rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 p-8 text-center">
          <p className="text-[13px] text-tlw-warm-gray">No folders yet.</p>
          {section === 'templates' && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="text-[12px] text-tlw-warm-gray">Quick add:</span>
              {TEMPLATE_SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => create(s.label, s.kind)}
                  disabled={busy}
                  className="rounded-tlw-md border border-tlw-warm-gray/30 px-2.5 py-1 text-[12px] text-tlw-espresso hover:border-tlw-warm-gray/50 disabled:opacity-40"
                >
                  + {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-4 rounded-tlw-xl border border-tlw-warm-gray/15 bg-tlw-surface p-4">
              {renaming === f.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FolderIcon />
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') rename(f.id)
                      if (e.key === 'Escape') { setRenaming(null); setRenameValue('') }
                    }}
                    autoFocus
                    className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-medium text-tlw-navy-deep outline-none placeholder:text-tlw-warm-gray/60"
                  />
                </div>
              ) : (
                <button onClick={() => onOpen({ id: f.id, name: f.name, kind: f.kind })} className="flex min-w-0 items-center gap-3 text-left">
                  <FolderIcon />
                  <span className="truncate text-[14px] font-medium text-tlw-navy-deep">{f.name}</span>
                  {KIND_LABEL[f.kind] && (
                    <span className="shrink-0 rounded-full bg-tlw-canvas px-2 py-0.5 text-[10px] uppercase tracking-[1px] text-tlw-warm-gray">
                      {KIND_LABEL[f.kind]}
                    </span>
                  )}
                  <span className="shrink-0 text-[12px] text-tlw-warm-gray">{f.count} item{f.count === 1 ? '' : 's'}</span>
                </button>
              )}
              <div className="flex shrink-0 items-center gap-3 text-[12px] font-medium">
                {renaming === f.id ? (
                  <>
                    <button onClick={() => rename(f.id)} disabled={busy || !renameValue.trim()} className="text-tlw-navy-rich hover:underline disabled:opacity-40">
                      save
                    </button>
                    <button onClick={() => { setRenaming(null); setRenameValue('') }} className="text-tlw-warm-gray hover:text-tlw-espresso">
                      cancel
                    </button>
                  </>
                ) : deleting === f.id ? (
                  <>
                    <button onClick={() => remove(f.id)} disabled={busy} className="text-red-600 hover:underline disabled:opacity-40">
                      delete folder &amp; contents
                    </button>
                    <button onClick={() => setDeleting(null)} className="text-tlw-warm-gray hover:text-tlw-espresso">
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setRenaming(f.id); setRenameValue(f.name); setDeleting(null) }}
                      className="text-tlw-warm-gray hover:text-tlw-espresso"
                    >
                      rename
                    </button>
                    <button onClick={() => setDeleting(f.id)} className="text-red-600 hover:underline">
                      delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          {section === 'templates' && unfiled > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-tlw-xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 p-4">
              {renamingUnfiled ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FolderIcon />
                  <input
                    value={unfiledDraft}
                    onChange={(e) => setUnfiledDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveUnfiled()
                      if (e.key === 'Escape') { setRenamingUnfiled(false); setUnfiledDraft(unfiledLabel) }
                    }}
                    autoFocus
                    placeholder={unfiledLabel}
                    className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-medium text-tlw-navy-deep outline-none"
                  />
                </div>
              ) : (
                <button onClick={() => onOpen({ id: 'none', name: unfiledLabel, kind: 'note' })} className="flex min-w-0 items-center gap-3 text-left">
                  <FolderIcon />
                  <span className="text-[14px] font-medium text-tlw-navy-deep">{unfiledLabel}</span>
                  <span className="text-[12px] text-tlw-warm-gray">{unfiled} template{unfiled === 1 ? '' : 's'} from before folders</span>
                </button>
              )}
              <div className="flex shrink-0 items-center gap-3 text-[12px] font-medium">
                {renamingUnfiled ? (
                  <>
                    <button onClick={saveUnfiled} disabled={busy} className="text-tlw-navy-rich hover:underline disabled:opacity-40">
                      save
                    </button>
                    <button onClick={() => { setRenamingUnfiled(false); setUnfiledDraft(unfiledLabel) }} className="text-tlw-warm-gray hover:text-tlw-espresso">
                      cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setRenamingUnfiled(true); setUnfiledDraft(unfiledLabel) }}
                    className="text-tlw-warm-gray hover:text-tlw-espresso"
                  >
                    rename
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-tlw-warm-gray">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}
