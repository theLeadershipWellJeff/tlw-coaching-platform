import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'
import { getMapFromVault } from '@/lib/vault/maps'

export const dynamic = 'force-dynamic'

// Live coaching-map content from the vault repo, looked up by note title
// (?name=The 6 Components). Returns { map: null } when the vault is
// unconfigured or has no such note — the card then falls back to its
// built-in copy. Coach-gated: the vault PAT must never reach the browser.
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    await requireCoach(supabase)

    const name = req.nextUrl.searchParams.get('name')?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const map = await getMapFromVault(name)
    return NextResponse.json({ map })
  } catch (e) {
    return toErrorResponse(e)
  }
}
