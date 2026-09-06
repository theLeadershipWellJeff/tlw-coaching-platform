import { NextRequest } from 'next/server'
import { adminContext, adminErrorResponse } from '@/lib/admin/route'
import { rosterCsv } from '@/lib/admin/debrief'

export const runtime = 'nodejs'

/** Roster CSV for the debrief coach (who has no app access). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await adminContext()
    const { filename, csv } = await rosterCsv(supabase, params.id)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return adminErrorResponse(e)
  }
}
