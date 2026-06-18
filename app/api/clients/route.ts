import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds, linkCoachToClient } from '@/lib/client-access'

// List the signed-in coach's clients (optionally filtered by status), by name.
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const status = new URL(req.url).searchParams.get('status')
    const ids = await accessibleClientIds(supabase, coach.id)
    if (ids.length === 0) return NextResponse.json({ clients: [] })

    let query = supabase.from('clients').select('*').in('id', ids).order('name', { ascending: true })
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ clients: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Create a client, owned by the signed-in coach.
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const body = await req.json().catch(() => null)
    const name = (body?.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        email: body.email?.trim() || null,
        title: body.title?.trim() || null,
        company: body.company?.trim() || null,
        status: body.status?.trim() || 'active',
        phone: body.phone?.trim() || null,
        ca_client_id: body.ca_client_id?.trim() || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        bio: body.bio?.trim() || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await linkCoachToClient(supabase, coach.id, data.id, 'primary')
    return NextResponse.json({ client: data }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
