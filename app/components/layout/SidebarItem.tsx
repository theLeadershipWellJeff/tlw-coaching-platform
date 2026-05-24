'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'

interface SidebarItemProps {
  href: string
  label: string
  icon: ReactNode
  active: boolean
  collapsed: boolean
  disabled?: boolean
  badge?: string
}

const base =
  'group relative flex items-center gap-3 rounded-tlw-md px-3 py-2 text-[13px] font-medium transition-colors duration-tlw-base'

export function SidebarItem({
  href,
  label,
  icon,
  active,
  collapsed,
  disabled,
  badge,
}: SidebarItemProps) {
  const iconEl = (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
  )

  if (disabled) {
    return (
      <div
        className={`${base} cursor-not-allowed text-tlw-warm-gray opacity-45`}
        title={collapsed ? label : undefined}
      >
        {iconEl}
        {!collapsed && (
          <span className="flex flex-1 items-center justify-between">
            <span className="truncate">{label}</span>
            {badge && (
              <span className="rounded-tlw-sm bg-tlw-warm-gray/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-tlw-warm-gray">
                {badge}
              </span>
            )}
          </span>
        )}
      </div>
    )
  }

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`${base} ${
        active
          ? 'bg-tlw-navy-rich/[0.06] text-tlw-navy-rich'
          : 'text-tlw-warm-gray hover:bg-tlw-warm-gray/[0.08] hover:text-tlw-espresso'
      }`}
    >
      <span className={active ? 'text-tlw-navy-rich' : 'text-tlw-warm-gray'}>{iconEl}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )
}
