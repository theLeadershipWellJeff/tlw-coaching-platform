import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: string
  eyebrow?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, breadcrumb, eyebrow, actions }: PageHeaderProps) {
  const topLabel = breadcrumb || eyebrow
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {topLabel && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
            {topLabel}
          </p>
        )}
        <h1 className="text-2xl font-medium leading-tight text-tlw-navy-deep">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-tlw-warm-gray">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
