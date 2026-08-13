'use client'
import { useEffect, useRef, useState } from 'react'

/** A small ⓘ button that reveals a one-line description of a card. */
export function InfoPopover({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`About ${label}`}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-tlw-warm-gray/40 text-[10px] font-medium italic text-tlw-warm-gray transition-colors hover:border-tlw-warm-gray hover:text-tlw-espresso"
      >
        i
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-tlw-lg border border-tlw-warm-gray/20 bg-tlw-surface p-3 text-[12px] leading-relaxed text-tlw-espresso shadow-lg">
          {text}
        </div>
      )}
    </div>
  )
}
