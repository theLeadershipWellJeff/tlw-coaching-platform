interface ComingSoonProps {
  title: string
  description?: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-tlw-2xl border border-dashed border-tlw-warm-gray/25 bg-tlw-surface/60 px-8 text-center">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
        Coming soon
      </p>
      <h2 className="mb-2 text-xl font-medium text-tlw-navy-deep">{title}</h2>
      {description && <p className="max-w-sm text-[13px] text-tlw-warm-gray">{description}</p>}
    </div>
  )
}
