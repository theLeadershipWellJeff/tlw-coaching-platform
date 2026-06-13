'use client'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

/** A simple centered modal with a scrim. Closes on Escape or scrim click. */
export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tlw-near-black/40 p-4 py-10"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-tlw-warm-gray/15 px-5 py-3">
          <p className="text-[14px] font-medium text-tlw-navy-deep">{title}</p>
          <button
            onClick={onClose}
            className="text-tlw-warm-gray transition-colors hover:text-tlw-espresso"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
