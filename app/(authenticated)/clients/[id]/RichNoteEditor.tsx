'use client'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'

/**
 * Rich text note editor built on TipTap.
 *
 * - Bold / italic, Title (H2) / Sub-title (H3), bullet + ordered lists
 * - Tab indents: inside a list it nests the item; otherwise it inserts an indent
 * - Emits both HTML (persisted) and plain text (for ACTION:/INSIGHT: capture)
 */
export function RichNoteEditor({
  html,
  onChange,
  placeholder = 'Write your session notes…',
}: {
  html: string
  onChange: (html: string, text: string) => void
  placeholder?: string
}) {
  // Ref lets the (once-created) handleKeyDown reach the live editor instance.
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
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
        // In a list, Tab/Shift-Tab nest/un-nest the item.
        if (ed.isActive('listItem')) {
          if (event.shiftKey) ed.chain().focus().liftListItem('listItem').run()
          else ed.chain().focus().sinkListItem('listItem').run()
          return true
        }
        // Otherwise insert / remove a visual indent (two spaces).
        if (event.shiftKey) return true
        ed.chain().focus().insertContent('  ').run()
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
      <Toolbar editor={editor} />
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

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    `rounded-tlw-md px-2 py-1 text-[12px] font-medium transition-colors ${
      active
        ? 'bg-tlw-navy-rich text-tlw-cream'
        : 'text-tlw-espresso hover:bg-tlw-canvas'
    }`

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-tlw-lg border border-tlw-warm-gray/15 bg-tlw-surface p-1">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))}
        title="Bold (Ctrl/Cmd+B)"
      >
        <span className="font-bold">B</span>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))}
        title="Italic (Ctrl/Cmd+I)"
      >
        <span className="italic">I</span>
      </button>

      <Divider />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive('heading', { level: 2 }))}
        title="Title"
      >
        Title
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive('heading', { level: 3 }))}
        title="Sub-title"
      >
        Sub-title
      </button>

      <Divider />

      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))}
        title="Bullet list"
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))}
        title="Numbered list"
      >
        1. List
      </button>

      <Divider />

      <button
        type="button"
        onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        disabled={!editor.can().sinkListItem('listItem')}
        className={`${btn(false)} disabled:opacity-40`}
        title="Indent (Tab)"
      >
        →|
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        disabled={!editor.can().liftListItem('listItem')}
        className={`${btn(false)} disabled:opacity-40`}
        title="Outdent (Shift+Tab)"
      >
        |←
      </button>
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-tlw-warm-gray/20" />
}
