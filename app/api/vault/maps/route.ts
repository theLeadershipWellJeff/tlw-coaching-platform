import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'
import { listVaultMapNames } from '@/lib/vault/maps'

export const dynamic = 'force-dynamic'

// The coaching-map registry, drawn live from the vault repo's Maps/ folder in
// map-number order — the pulldowns mirror the vault, so adding/renaming/removing
// a map note there updates the app. Returns { names: null } when the vault is
// unconfigured or unreachable — the pulldowns then fall back to the built-in
// list. Coach-gated: the vault PAT must never reach the browser.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    await requireCoach(supabase)

    const names = await listVaultMapNames()
    return NextResponse.json({ names })
  } catch (e) {
    return toErrorResponse(e)
  }
}
