import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'

const DEFAULT_TITLE = 'TLW Client Portal'

/** "Jeff" → "Jeff's Portal"; "James" → "James' Portal". */
function portalTitleFor(firstName: string): string {
  return /s$/i.test(firstName) ? `${firstName}\u2019 Portal` : `${firstName}\u2019s Portal`
}

/**
 * The browser-tab title reads "<first name>'s Portal" for a signed-in client
 * (their "what should I call you" name first, else the first word of their
 * name) and "TLW Client Portal" everywhere else (sign-in, privacy, or any
 * lookup failure). Only the client's own name, read through their own session.
 */
export async function generateMetadata(): Promise<Metadata> {
  try {
    const clientId = await getPortalClientId()
    if (!clientId) return { title: DEFAULT_TITLE }
    const supabase = getSupabaseAdmin()
    let row: { name?: string | null; preferred_name?: string | null } | null = null
    const withPreferred = await supabase
      .from('clients')
      .select('name, preferred_name')
      .eq('id', clientId)
      .maybeSingle()
    if (withPreferred.error) {
      // Pre-061 databases have no preferred_name column.
      const plain = await supabase.from('clients').select('name').eq('id', clientId).maybeSingle()
      row = plain.data
    } else {
      row = withPreferred.data
    }
    const first = (row?.preferred_name || '').trim() || (row?.name || '').trim().split(/\s+/)[0] || ''
    return { title: first ? portalTitleFor(first) : DEFAULT_TITLE }
  } catch {
    return { title: DEFAULT_TITLE }
  }
}

/**
 * Client Portal shell — deliberately separate from the coach app shell
 * (app/(authenticated)/layout). No coach navigation ever renders here.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-tlw-canvas text-tlw-espresso">{children}</div>
}
