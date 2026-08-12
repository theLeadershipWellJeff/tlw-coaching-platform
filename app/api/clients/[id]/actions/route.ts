import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { withOrgClaim } from '@/lib/supabase/pg'
import { tenantClaimsFromCoach } from '@/lib/tenant'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// List a client's persisted action items (those sent to the client via a note
// email), most recent first — so the coach can see what's been marked done.
// Authorize on the admin client; read through an org-scoped Postgres
// transaction so RLS enforces the tenant boundary (Phase 1 §5.3, Option A).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const coach = await requireClientCoach(getSupabaseAdmin(), params.id)
    const actions = await withOrgClaim(
      tenantClaimsFromCoach(coach),
      (sql) => sql`
        select id, note_id, description, status, due_date, completed_at, created_at
        from actions
        where client_id = ${params.id}
        order by created_at desc
      `
    )
    return NextResponse.json({ actions })
  } catch (e) {
    return toErrorResponse(e)
  }
}
