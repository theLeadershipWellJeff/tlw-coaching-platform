'use client'
import { useEditor, EditorContent, Extension, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import OrderedList from '@tiptap/extension-ordered-list'
import { useEffect, useRef, useState } from 'react'
import type { NoteTemplate } from '@/lib/supabase/types'
import { TEMPLATE_FIELDS } from '@/lib/note-template-fields'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

const MAX_INDENT = 10

// Block indentation for paragraphs/headings, so Tab indents outside of lists.
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-indent')) || 0,
            renderHTML: (attrs) =>
              attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left:${attrs.indent * 1.6}rem` } : {},
          },
        },
      },
    ]
  },
  addCommands() {
    const shift = (delta: number) => ({ state, dispatch }: any) => {
      const { from, to } = state.selection
      const tr = state.tr
      let changed = false
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          const cur = node.attrs.indent || 0
          const next = Math.min(MAX_INDENT, Math.max(0, cur + delta))
          if (next !== cur) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
            changed = true
          }
        }
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    }
    return { indent: () => shift(1), outdent: () => shift(-1) }
  },
})

// Ordered list that can carry the Harvard-outline style. Only the top list needs
// the class — CSS (.tlw-prose ol.tlw-outline …) styles the nested levels.
const OutlineOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      outline: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-outline') === 'true',
        renderHTML: (attrs) => (attrs.outline ? { 'data-outline': 'true', class: 'tlw-outline' } : {}),
      },
    }
  },
})

/** Tab nests a list item or indents a block; Shift-Tab does the reverse. */
function smartIndent(editor: Editor, dir: 1 | -1) {
  if (editor.isActive('listItem')) {
    if (dir === 1) editor.chain().focus().sinkListItem('listItem').run()
    else editor.chain().focus().liftListItem('listItem').run()
    return
  }
  if (dir === 1) editor.chain().focus().indent().run()
  else editor.chain().focus().outdent().run()
}

/**
 * Rich text note editor built on TipTap.
 *
 * - Bold / italic, Title (H2) / Sub-title (H3), bullet + numbered + Harvard
 *   outline (I. A. 1. a. i.) lists
 * - Tab indents (nests a list item, or indents a paragraph); Shift-Tab outdents
 * - Emits both HTML (persisted) and plain text (for ACTION:/INSIGHT: capture)
 */
export function RichNoteEditor({
  html,
  onChange,
  placeholder = 'Write your session notes…',
  enableTemplates = false,
  enableFields = false,
  clientId,
}: {
  html: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  // Show a "Templates" dropdown that inserts a saved Library template, resolving
  // its merge fields against `clientId` when provided.
  enableTemplates?: boolean
  // Show an "Insert field" dropdown (for authoring templates in the Library).
  enableFields?: boolean
  clientId?: string
}) {
  // Ref lets the (once-created) handleKeyDown reach the live editor instance.
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        orderedList: false,
      }),
      OutlineOrderedList,
      Indent,
    ],
    content: html || '',
    editorProps: {
      attributes: {
        class:
          'tlw-prose min-h-[320px] w-full rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas/40 p-4 text-[14px] leading-relaxed text-tlw-espresso outline-none focus:border-tlw-signal-orange',
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Tab') return false
        const ed = editorRef.current
        if (!ed) return false
        event.preventDefault()
        smartIndent(ed, event.shiftKey ? -1 : 1)
        return true
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getHTML(), editor.getText())
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  if (!editor) {
    return (
      <div className="min-h-[320px] animate-pulse rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-canvas/40" />
    )
  }

  return (
    <div className="space-y-2">
      <Toolbar editor={editor} enableTemplates={enableTemplates} enableFields={enableFields} clientId={clientId} />
      <div className="relative">
        {editor.isEmpty && (
          <p className="pointer-events-none absolute left-4 top-4 text-[14px] text-tlw-warm-gray/60">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({
  editor,
  enableTemplates,
  enableFields,
  clientId,
}: {
  editor: Editor
  enableTemplates: boolean
  enableFields: boolean
  clientId?: string
}) {
  const btn = (active: boolean) =>
    `rounded-tlw-md px-2 py-1 text-[12px] font-medium transition-colors ${
      active ? 'bg-tlw-navy-rich text-tlw-cream' : 'text-tlw-espresso hover:bg-tlw-canvas'
    }`

  // Numbered (decimal) vs Harvard outline share the orderedList node, told apart
  // by its `outline` attribute. Clicking the active style toggles the list off.
  function setNumbered() {
    if (editor.isActive('orderedList', { outline: false })) editor.chain().focus().toggleOrderedList().run()
    else if (editor.isActive('orderedList')) editor.chain().focus().updateAttributes('orderedList', { outline: false }).run()
    else editor.chain().focus().toggleOrderedList().run()
  }
  function setOutline() {
    if (editor.isActive('orderedList', { outline: true })) editor.chain().focus().toggleOrderedList().run()
    else if (editor.isActive('orderedList')) editor.chain().focus().updateAttributes('orderedList', { outline: true }).run()
    else editor.chain().focus().toggleOrderedList().updateAttributes('orderedList', { outline: true }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-1">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Bold (Ctrl/Cmd+B)">
        <span className="font-bold">B</span>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Italic (Ctrl/Cmd+I)">
        <span className="italic">I</span>
      </button>

      <Divider />

      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))} title="Title">
        Title
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive('heading', { level: 3 }))} title="Sub-title">
        Sub-title
      </button>

      <Divider />

      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Bullet list">
        • List
      </button>
      <button type="button" onClick={setNumbered} className={btn(editor.isActive('orderedList', { outline: false }))} title="Numbered list">
        1. List
      </button>
      <button type="button" onClick={setOutline} className={btn(editor.isActive('orderedList', { outline: true }))} title="Harvard outline (I. A. 1. a. i.)">
        I. Outline
      </button>

      <Divider />

      <button type="button" onClick={() => smartIndent(editor, 1)} className={btn(false)} title="Indent (Tab)">
        →|
      </button>
      <button type="button" onClick={() => smartIndent(editor, -1)} className={btn(false)} title="Outdent (Shift+Tab)">
        |←
      </button>

      {enableFields && (
        <>
          <Divider />
          <FieldsMenu editor={editor} />
        </>
      )}
      {enableTemplates && (
        <>
          <Divider />
          <TemplatesMenu editor={editor} clientId={clientId} />
        </>
      )}
    </div>
  )
}

/** Lightweight toolbar dropdown shell (button + outside-click menu). */
function Menu({ label, title, children }: { label: string; title: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-tlw-md px-2 py-1 text-[12px] font-medium text-tlw-espresso transition-colors hover:bg-tlw-canvas"
        title={title}
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-56 overflow-auto rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-surface py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Insert a merge-field token while authoring a template. */
function FieldsMenu({ editor }: { editor: Editor }) {
  return (
    <Menu label="Insert field" title="Insert a field that fills in from the client">
      {(close) => (
        <>
          <p className="px-3 py-1.5 text-[11px] text-tlw-warm-gray">Fills in when added to a note</p>
          {TEMPLATE_FIELDS.map((f) => (
            <button
              key={f.token}
              type="button"
              onClick={() => {
                editor.chain().focus().insertContent(`${f.token} `).run()
                close()
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] text-tlw-espresso hover:bg-tlw-canvas"
            >
              {f.label}
              <span className="block text-[11px] text-tlw-warm-gray">{f.hint}</span>
            </button>
          ))}
        </>
      )}
    </Menu>
  )
}

/** Insert a saved Library template, resolving its merge fields against the client. */
function TemplatesMenu({ editor, clientId }: { editor: Editor; clientId?: string }) {
  const [templates, setTemplates] = useState<NoteTemplate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  function ensureLoaded() {
    if (templates !== null) return
    setLoading(true)
    fetch('/api/templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }

  async function insert(t: NoteTemplate, close: () => void) {
    let content = t.content || ''
    if (clientId && content.includes('{{')) {
      setBusy(true)
      try {
        const res = await fetch(`/api/clients/${clientId}/template-render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        if (res.ok) content = (await res.json()).content || content
      } catch {
        // fall back to the raw template on any failure
      } finally {
        setBusy(false)
      }
    }
    editor.chain().focus().insertContent(content).run()
    close()
  }

  return (
    <span onMouseEnter={ensureLoaded} onClick={ensureLoaded}>
      <Menu label={busy ? 'Inserting…' : 'Templates'} title="Insert a template">
        {(close) =>
          loading ? (
            <p className="px-3 py-2 text-[12px] text-tlw-warm-gray">loading…</p>
          ) : !templates || templates.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-tlw-warm-gray">No templates yet — add them in the Library.</p>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => insert(t, close)}
                className="block w-full truncate px-3 py-1.5 text-left text-[13px] text-tlw-espresso hover:bg-tlw-canvas"
              >
                {t.name}
              </button>
            ))
          )
        }
      </Menu>
    </span>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-tlw-warm-gray/20" />
}
