/**
 * Direct Postgres access for the org-scoped RLS data path (Phase 1 §5.3,
 * Option A). We are on NextAuth, and the project verifies JWTs with an
 * asymmetric signing key we cannot self-sign — so instead of minting a token for
 * PostgREST, we open a pooled Postgres connection and, per transaction, switch to
 * the `authenticated` role and set the org claim. Postgres RLS policies then
 * apply exactly as they would for a real authenticated request. This is the
 * mechanism the staging proof validated, and it is immune to Supabase's JWT
 * signing-key configuration.
 *
 * Use ONLY for tenant-scoped queries that should be RLS-enforced. The
 * service-role supabase-js admin client (getSupabaseAdmin) stays the path for
 * identity/authorization, writes (for now), crons, and webhooks.
 */
import postgres, { type Sql, type TransactionSql } from 'postgres'
import type { TenantClaims } from '../tenant'

let sql: Sql | null = null

function getSql(): Sql {
  if (sql) return sql
  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is not set — the Supabase Transaction pooler connection ' +
        'string (Project Settings → Database → Connection string → Transaction). ' +
        'Required for the org-scoped RLS data path.'
    )
  }
  sql = postgres(url, {
    prepare: false, // required for pgbouncer transaction-mode pooling
    max: 1, // one connection per serverless instance; the pooler fans out
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      // Return DATE (oid 1082) as the raw 'YYYY-MM-DD' string, matching what the
      // API returned under PostgREST. postgres.js otherwise parses dates to JS
      // Date objects, which JSON-serialize to full ISO timestamps — the UI does
      // `session_date + 'T12:00:00'` and binds it to <input type="date">, both of
      // which require a bare date string. (timestamptz stays a Date → ISO, which
      // the UI consumes via new Date(), so no override needed there.)
      date: {
        to: 1082,
        from: [1082],
        serialize: (v: string) => v,
        parse: (v: string) => v,
      },
    },
  })
  return sql
}

/**
 * Run `fn` inside a transaction scoped to the caller's organization: the role is
 * set to `authenticated` (which does NOT bypass RLS) and the `org_id` claim is
 * set, so RLS policies filter every row to the tenant. Read-only callers commit
 * a no-op transaction; SET LOCAL resets automatically at transaction end.
 */
export async function withOrgClaim<T>(
  claims: TenantClaims,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  const db = getSql()
  const result = await db.begin(async (tx) => {
    const jwtClaims = JSON.stringify({
      role: 'authenticated',
      org_id: claims.orgId,
      coach_id: claims.coachId,
      coach_role: claims.coachRole,
    })
    // Set the claim first (as the connecting role), then drop into the
    // authenticated role so RLS applies to the actual query.
    await tx`select set_config('request.jwt.claims', ${jwtClaims}, true)`
    await tx`set local role authenticated`
    return fn(tx)
  })
  // postgres.js's begin() return type unwraps promise-arrays; our fn already
  // returns the resolved value, so narrow back to T.
  return result as T
}
