import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { buildCoachExport } from '@/lib/export/coach-export'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/subscription/export — "Download my data": a ZIP of the coach's
 * whole tenant (lib/export/coach-export.ts). Deliberately available to a
 * LOCKED coach — the wall must never hold a coach's work hostage.
 */
export async function GET() {
  const supabase = getSupabaseAdmin()
  let coach
  try {
    coach = await requireCoach(supabase, { allowLocked: true })
  } catch (e) {
    return toErrorResponse(e)
  }
  try {
    const { zip, filename, counts } = await buildCoachExport(supabase, coach)
    await logAdminAction(supabase, { actorCoachId: coach.id, action: 'coach_data_export', targetCoachId: coach.id, detail: { counts, bytes: zip.length } })
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    console.error('[export] failed:', e)
    return NextResponse.json({ error: e?.message ?? 'Export failed' }, { status: 500 })
  }
}
