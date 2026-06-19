/**
 * Shared API-route plumbing: session/coach gating, request-body validation, and
 * a single place to turn thrown errors into clean JSON responses. Every route
 * was hand-rolling getServerSession → getSupabaseAdmin → getSessionCoach →
 * try/catch; this centralizes the auth and error shape so new routes (and the
 * coach-scoped block data access the Block Registry spec calls for) get it for
 * free and consistently.
 *
 * Pattern:
 *   export async function POST(req: NextRequest) {
 *     try {
 *       await requireSession()
 *       const body = await readJson(req, MySchema)
 *       ...domain work...
 *       return NextResponse.json({ ok: true })
 *     } catch (e) {
 *       return toErrorResponse(e)
 *     }
 *   }
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authOptions } from './authOptions'
import { getSessionCoach } from './coach'
import type { Coach, Database } from './supabase/types'

/** An error carrying the HTTP status it should surface as. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Require a signed-in session; throws ApiError(401) otherwise. */
export async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session) throw new ApiError(401, 'Unauthorized')
  return session
}

/** Require the signed-in coach; throws ApiError(401) otherwise. */
export async function requireCoach(supabase: SupabaseClient<Database>): Promise<Coach> {
  const coach = await getSessionCoach(supabase)
  if (!coach) throw new ApiError(401, 'Unauthorized')
  return coach
}

/**
 * Parse + validate a JSON request body against a zod schema. Throws
 * ApiError(400) on bad JSON or a schema violation, with the first issue's
 * message — so routes stop trusting raw `await req.json()`.
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Invalid JSON body')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message || 'Invalid request')
  }
  return parsed.data
}

/**
 * Turn a thrown error into a JSON response. Known ApiErrors surface their
 * status/message; anything else is logged server-side and returned as a generic
 * 500 so we never leak internal details (DB messages, stack traces) to clients.
 */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  console.error('[api] unhandled error', e)
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
}
