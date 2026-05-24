'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const STORAGE_KEY = 'tlw-sidebar-collapsed'

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-tlw-canvas">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  )
}
