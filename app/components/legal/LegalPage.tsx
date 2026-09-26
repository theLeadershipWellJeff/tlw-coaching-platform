import Link from 'next/link'
import type { ReactNode } from 'react'
import { TLWLogo } from '@/app/components/TLWLogo'

/**
 * Shared shell for the public legal pages (/privacy, /terms). Public by
 * construction — the middleware only guards /portal — and static, so Google's
 * OAuth reviewers and prospective coaches can read them signed out.
 */
export const LEGAL_ENTITY = 'MxV Coaching Inc.'
export const LEGAL_BRAND = 'theLeadershipWell'
export const LEGAL_ADDRESS = '1021 S. Cleveland St., Unit 104, Oceanside, CA 92054'
export const LEGAL_CONTACT_EMAIL = 'Admin@theleadershipwell.com'
export const LEGAL_EFFECTIVE_DATE = 'September 26, 2026'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-tlw-surface">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="flex items-center gap-3">
          <TLWLogo size={36} />
          <span className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">theLeadershipWell</span>
        </Link>
        <h1 className="mt-8 font-serif text-[32px] font-light text-tlw-navy-deep">{title}</h1>
        <p className="mt-2 text-[13px] text-tlw-warm-gray">Effective {LEGAL_EFFECTIVE_DATE}</p>
        <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-tlw-espresso">{children}</div>
        <LegalFooter />
      </div>
    </div>
  )
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-[1.5px] text-tlw-navy-rich">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  )
}

export function LegalFooter({ light = false }: { light?: boolean }) {
  const tone = light ? 'text-tlw-warm-gray hover:text-tlw-cream' : 'text-tlw-warm-gray hover:text-tlw-navy-deep'
  return (
    <p className="mt-12 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-tlw-warm-gray">
      <span>© 2026 {LEGAL_ENTITY}</span>
      <Link href="/privacy" className={`underline ${tone}`}>Privacy Policy</Link>
      <Link href="/terms" className={`underline ${tone}`}>Terms of Service</Link>
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={`underline ${tone}`}>Contact</a>
    </p>
  )
}
