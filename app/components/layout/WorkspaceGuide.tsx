'use client'
import { useEffect, useState } from 'react'
import { WORKSPACE_GUIDES, guideStorageKey, type WorkspaceGuideKey } from '@/lib/workspace-guides'

/**
 * The dismissable "how to use this space" note under a workspace title. Copy
 * comes from lib/workspace-guides.ts; closing it persists per workspace in
 * localStorage so it stays out of the way once the coach knows the space.
 * Renders nothing until mounted (the dismissal is browser state), so the server
 * and client markup always agree.
 */
export function WorkspaceGuide({ id }: { id: WorkspaceGuideKey }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(guideStorageKey(id))) return
    } catch {
      /* storage blocked — just show it */
    }
    setVisible(true)
  }, [id])

  if (!visible) return null

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(guideStorageKey(id), '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="note"
      className="mt-4 flex items-start gap-3 rounded-tlw-lg border border-tlw-navy-rich/15 bg-tlw-navy-rich/[0.04] px-4 py-3"
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-[13px] text-tlw-navy-rich">
        ✦
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-tlw-espresso">{WORKSPACE_GUIDES[id]}</p>
      <button
        type="button"
        onClick={dismiss}
        title="Close this guide (Account → Profile brings the guides back)"
        aria-label="Close this guide"
        className="shrink-0 rounded-tlw-sm px-1.5 text-[16px] leading-none text-tlw-warm-gray transition-colors hover:bg-tlw-warm-gray/10 hover:text-tlw-espresso"
      >
        ×
      </button>
    </div>
  )
}
