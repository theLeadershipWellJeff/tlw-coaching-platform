import type { PortalBranding } from '@/lib/portal/branding'

/**
 * Enterprise co-branding band (migration 073): the sponsor company's logo and
 * "Powered by theLeadershipWell" side by side at the SAME height, so neither
 * brand outranks the other. White surface so logos drawn on white sit clean.
 * Stacks on a phone. Renders nothing when the client has no company logo.
 *
 * Presentational only (no hooks) — used by the server-rendered home page and
 * the client-rendered chat alike.
 */
export function CoBrandHeader({ branding, compact = false }: { branding: PortalBranding | null; compact?: boolean }) {
  if (!branding) return null
  const logoH = compact ? 'h-8 sm:h-9' : 'h-10 sm:h-12'
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-tlw-2xl border border-tlw-warm-gray/15 bg-white sm:flex-row sm:gap-8 ${
        compact ? 'px-4 py-2.5' : 'px-5 py-4'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={branding.logoUrl} alt={branding.companyName} className={`${logoH} w-auto max-w-full object-contain`} />
      <span aria-hidden className={`hidden w-px self-stretch bg-tlw-warm-gray/30 sm:block`} />
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-email.png" alt="theLeadershipWell" className={`mt-1 ${logoH} w-auto max-w-full object-contain`} />
      </div>
    </div>
  )
}
