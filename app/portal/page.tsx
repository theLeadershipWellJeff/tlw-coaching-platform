import { redirect } from 'next/navigation'
import { getPortalClientId } from '@/lib/portal/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { PortalLogoutButton } from './PortalLogoutButton'

export const dynamic = 'force-dynamic'

/**
 * Client Portal home. Phase 1 is a minimal authenticated shell proving the
 * boundary — the read-only workspace cards arrive in Phase 2. Only non-sensitive
 * client fields are ever read here (never key_info or any coach-private field).
 */
export default async function PortalHome() {
  const clientId = await getPortalClientId()
  if (!clientId) redirect('/portal/login')

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) redirect('/portal/login')

  const firstName = (client.name || '').split(' ')[0] || 'there'

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray">
          theLeadershipWell
        </p>
        <PortalLogoutButton />
      </div>
      <h1 className="mt-8 text-[24px] font-medium text-tlw-navy-deep">Welcome, {firstName}.</h1>
      <p className="mt-3 text-[15px] text-tlw-warm-gray">
        You&apos;re signed in to your coaching portal. Your goals, sessions, and resources will
        appear here soon.
      </p>
    </div>
  )
}
