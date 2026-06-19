import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { getActiveSignatureHtml } from '@/lib/signature'

// The active branded signature for the signed-in coach — so the Compose panel
// can render the exact (locked, non-editable) block that will be appended at
// send time. The signature is still appended server-side on send; this is
// preview only.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const html = await getActiveSignatureHtml(supabase, coach.id)
    return NextResponse.json({ html })
  } catch (e) {
    return toErrorResponse(e)
  }
}
