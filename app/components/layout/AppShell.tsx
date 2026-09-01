'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const STORAGE_KEY = 'tlw-sidebar-collapsed'
const MOBILE_QUERY = '(max-width: 767px)'

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    // On a small screen always start collapsed — the stored preference is a
    // desktop choice, and an expanded rail would cover most of a phone.
    if (mq.matches) {
      setCollapsed(true)
    } else {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) setCollapsed(stored === 'true')
    }
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  // On mobile the expanded menu floats over the content, so close it once a
  // destination is picked (without treating that as a saved preference).
  const overlayExpanded = isMobile && !collapsed

  return (
    <div className="flex h-screen overflow-hidden bg-tlw-canvas">
      {overlayExpanded && (
        <>
          <div className="w-16 shrink-0" aria-hidden />
          <div
            className="fixed inset-0 z-30 bg-black/30"
            onClick={() => setCollapsed(true)}
            aria-hidden
          />
        </>
      )}
      <Sidebar
        collapsed={collapsed}
        onToggle={toggle}
        floating={overlayExpanded}
        onNavigate={isMobile ? () => setCollapsed(true) : undefined}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
