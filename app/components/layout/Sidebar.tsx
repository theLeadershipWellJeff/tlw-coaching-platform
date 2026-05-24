'use client'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { TLWLogo } from '../TLWLogo'
import { SidebarItem } from './SidebarItem'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

interface NavDestination {
  href: string
  label: string
  icon: ReactNode
  disabled?: boolean
  badge?: string
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.6-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11.5a3 3 0 0 0 0-6" />
      <path d="M17 15.5c2.2.4 3.5 2.2 3.5 4.5" />
    </svg>
  ),
  groups: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5.5" cy="16" r="2.5" />
      <circle cx="18.5" cy="16" r="2.5" />
      <path d="M12 10v4M9.5 15.5 7.5 14M14.5 15.5l2-1.5" />
    </svg>
  ),
  templates: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <path d="M5 4h5v16H5zM10 4h4v16h-4z" />
      <path d="M14 5.5l4 1 3 14-4-1z" />
    </svg>
  ),
  practice: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <path d="M3 13l4 4 5-7 4 5 5-9" />
      <path d="M3 20h18" />
    </svg>
  ),
  business: (
    <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
}

const destinations: NavDestination[] = [
  { href: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
  { href: '/clients', label: 'Clients', icon: icons.clients },
  { href: '/groups', label: 'Groups', icon: icons.groups },
  { href: '/templates', label: 'Templates', icon: icons.templates },
  { href: '/library', label: 'Library', icon: icons.library },
  { href: '/practice', label: 'Practice', icon: icons.practice },
  { href: '#', label: 'Business Center', icon: icons.business, disabled: true, badge: 'Soon' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-tlw-warm-gray/15 bg-tlw-surface transition-all duration-tlw-base ${
        collapsed ? 'w-16' : 'w-[200px]'
      }`}
    >
      <div className="flex h-16 items-center gap-2 border-b border-tlw-warm-gray/15 px-4">
        <TLWLogo size={26} />
        {!collapsed && (
          <span className="truncate text-[13px] font-semibold tracking-tight text-tlw-navy-deep">
            theLeadershipWell
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {destinations.map((d) => {
          const active =
            !d.disabled && (pathname === d.href || pathname.startsWith(d.href + '/'))
          return (
            <SidebarItem
              key={d.label}
              href={d.href}
              label={d.label}
              icon={d.icon}
              active={active}
              collapsed={collapsed}
              disabled={d.disabled}
              badge={d.badge}
            />
          )
        })}
      </nav>

      <button
        onClick={onToggle}
        className="flex items-center gap-3 border-t border-tlw-warm-gray/15 px-4 py-3 text-[12px] text-tlw-warm-gray transition-colors duration-tlw-base hover:text-tlw-espresso"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          {...stroke}
          className={`shrink-0 transition-transform duration-tlw-base ${collapsed ? 'rotate-180' : ''}`}
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  )
}
