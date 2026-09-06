import { NextResponse } from 'next/server'
import { getPortalClientId } from '@/lib/portal/server'
import { loadPortalAssessments } from '@/lib/portal/assessments'

export const runtime = 'nodejs'

/**
 * The client's completed assessments (newest first by assessment_date) and
 * whether the assessment surfaces are switched on for them. Drives the
 * "Your 360 Report" card and the chat's conversation starters. Route-level
 * gate on portal_features.assessments — never on client_type.
 */
export async function GET() {
  const clientId = await getPortalClientId()
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await loadPortalAssessments(clientId)
  return NextResponse.json(result)
}
