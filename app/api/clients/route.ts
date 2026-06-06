import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'

// List clients (optionally filtered by status), newest activity first.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status')

  const supabase = getSupabaseAdmin()
  let query = supabase.from('clients').select('*').order('name', { ascending: true })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ clients: data })
}

// Create a client.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = (body?.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
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
  return NextResponse.json({ client: data }, { status: 201 })
}
