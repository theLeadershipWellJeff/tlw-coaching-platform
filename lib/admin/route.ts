/**
 * Shared plumbing for the /api/admin/* routes (assessment debrief command
 * center). Every route is supervisor-only and writes the admin audit log.
 */
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import type { Coach, Database } from '@/lib/supabase/types'
import { DocumentError } from '@/lib/documents/pipeline'
import { AdminError } from './debrief'

export async function adminContext(): Promise<{ supabase: SupabaseClient<Database>; actor: Coach }> {
  const supabase = getSupabaseAdmin()
  const actor = await requireSupervisor(supabase)
  return { supabase, actor }
}

export function adminErrorResponse(e: unknown): NextResponse {
  if (e instanceof AdminError || e instanceof DocumentError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  return toErrorResponse(e)
}
