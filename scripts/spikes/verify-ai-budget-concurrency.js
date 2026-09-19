#!/usr/bin/env node
/**
 * Budget enforcement proof (Phase 2, migration 070) against a REAL Postgres:
 *   • N concurrent ai_reserve() calls at a nearly exhausted cap → exactly the
 *     affordable number succeed (no overshoot, ever);
 *   • the org ceiling, feature caps, and the soft state read back correctly;
 *   • a dated (this-month) client row outranks the standing default (Extend);
 *   • stale reservations are released and stop counting;
 *   • coach-principal calls never touch the client cap.
 *
 *   PG=env PGHOST=127.0.0.1 PGPORT=55432 PGDATABASE=tlw PGUSER=postgres node scripts/spikes/verify-ai-budget-concurrency.js
 *
 * PG=env reads the PG* variables; any other value is a connection URL. The
 * database needs `organizations`, `coaches`, `clients` (stubs are created when
 * absent — never on a real database) and migrations 069 + 070 (applied here if
 * the tables/functions are missing). Everything runs inside a transaction
 * per assertion where possible and cleans up its own rows.
 */
const fs = require('fs')
const path = require('path')
const postgres = require('postgres')

const ORG = '00000000-0000-4000-8000-000000000001'
const COACH = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const PORTAL_CLIENT = '33333333-3333-4333-8333-333333333333'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) pass++
  else fail++
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? ` — ${detail}` : ''}`)
}

async function main() {
  if (!process.env.PG) {
    console.log('SKIP: set PG=env (with PG* vars) or PG=postgres://…')
    process.exit(0)
  }
  const opts = { max: 12, onnotice: () => {} }
  const sql = process.env.PG === 'env' ? postgres(opts) : postgres(process.env.PG, opts)
  try {
    // --- stubs (only when absent) + migrations ---
    await sql.unsafe(`create table if not exists organizations (id uuid primary key default gen_random_uuid(), name text)`)
    await sql`insert into organizations (id, name) values (${ORG}, 'theLeadershipWell') on conflict do nothing`
    await sql.unsafe(`create table if not exists coaches (id uuid primary key default gen_random_uuid(), org_id uuid not null default '${ORG}', email text)`)
    await sql.unsafe(`create table if not exists clients (id uuid primary key default gen_random_uuid(), org_id uuid not null default '${ORG}', name text, client_type text default 'client')`)
    await sql`insert into coaches (id, email) values (${COACH}, 'coach@example.com') on conflict do nothing`
    await sql`insert into clients (id, name, client_type) values (${CLIENT}, 'Sam Client', 'client'), (${PORTAL_CLIENT}, 'Pat Participant', 'portal') on conflict do nothing`
    const mig = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', f), 'utf8')
    const [{ n: hasUsage }] = await sql`select count(*)::int as n from pg_tables where tablename = 'ai_usage'`
    if (!hasUsage) await sql.unsafe(mig('069_ai_cost_controls.sql'))
    const [{ n: hasFn }] = await sql`select count(*)::int as n from pg_proc where proname = 'ai_reserve'`
    if (!hasFn) await sql.unsafe(mig('070_ai_budget_enforcement.sql'))

    // clean slate for our rows
    await sql`delete from ai_usage where client_id in (${CLIENT}, ${PORTAL_CLIENT}) or coach_id = ${COACH}`
    await sql`delete from ai_budgets where scope_id in (${CLIENT}, ${PORTAL_CLIENT}, 'scoring', 'principal:coach')`
    await sql`delete from ai_alerts where scope_id in (${CLIENT}, ${PORTAL_CLIENT})`
    await sql`update ai_budgets set enabled = true where period_month is null and note like '%brief default%'`

    const reserve = (i, opts = {}) =>
      sql`select ai_reserve(${`t-${Date.now()}-${i}-${Math.random()}`}, ${ORG}, ${opts.coach ?? COACH}, ${opts.client ?? CLIENT}, ${opts.principal ?? 'client'}, ${opts.purpose ?? 'portal_chat'}, ${opts.feature ?? 'portal_chat:general'}, 'claude-opus-5', ${opts.reserved ?? 1_000_000}, '{}'::jsonb) as r`.then((r) => r[0].r)

    console.log('1. concurrency at a nearly exhausted cap')
    // Standing default client cap = $10. Spend $8.50 already (settled), then fire 20 concurrent $1 reservations → exactly 1 fits.
    await sql`insert into ai_usage (request_id, org_id, coach_id, client_id, principal, purpose, feature, model, status, reserved_usd_micros, actual_usd_micros)
              values ('seed-1', ${ORG}, ${COACH}, ${CLIENT}, 'client', 'portal_chat', 'portal_chat:general', 'claude-opus-5', 'settled', 9000000, 8500000)`
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => reserve(i)))
    const okCount = results.filter((r) => r.ok).length
    check('exactly 1 of 20 concurrent $1 reserves passes with $1.50 left', okCount === 1, `${okCount} passed`)
    check('refusals name the client scope with cap/spent/resets_on', results.filter((r) => !r.ok).every((r) => r.scope === 'client' && r.cap === 10000000 && typeof r.resets_on === 'string'))
    const [{ spent }] = await sql`select ai_month_spend(${ORG}, 'client', ${CLIENT}, date_trunc('month', now() at time zone 'utc')::date) as spent`
    check('month spend = settled actual + the one reservation ($9.50)', Number(spent) === 9500000, `${spent}`)

    console.log('2. status + soft state')
    let [{ s }] = await sql`select ai_budget_status(${ORG}, ${CLIENT}, 'client', 'portal_chat') as s`
    check('state is soft at 95% of a $10 cap (soft_pct 80)', s.state === 'soft', s.state)
    check('status reports client spent/cap/source', s.client.spent === 9500000 && s.client.cap === 10000000 && s.client.source === 'default')
    check('resets_on is the first of next month', /-01$/.test(s.resets_on))

    console.log('3. coach-principal calls never touch the client cap')
    const coachRes = await reserve(99, { principal: 'coach', purpose: 'scoring', feature: 'scoring', reserved: 5_000_000 })
    check('a $5 scoring reserve for the same client passes (client cap is portal-only)', coachRes.ok === true, JSON.stringify(coachRes))
    ;[{ spent: spentAfter }] = await sql`select ai_month_spend(${ORG}, 'client', ${CLIENT}, date_trunc('month', now() at time zone 'utc')::date) as spent`
    check('client scope spend unchanged by the coach call', Number(spentAfter) === 9500000)

    console.log('4. hard state + Extend (dated row outranks the standing default)')
    // Push the client over: settle the $1 reservation at $0.60 and add one more
    // settled $1 call → $8.50 + $0.60 + $1.00 = $10.10 spent (cap $10) → hard.
    await sql`update ai_usage set status='settled', actual_usd_micros = 600000 where client_id = ${CLIENT} and status = 'reserved' and principal = 'client'`
    await sql`insert into ai_usage (request_id, org_id, coach_id, client_id, principal, purpose, feature, model, status, reserved_usd_micros, actual_usd_micros)
              values ('seed-2', ${ORG}, ${COACH}, ${CLIENT}, 'client', 'portal_chat', 'portal_chat:general', 'claude-opus-5', 'settled', 1000000, 1000000)`
    ;[{ s }] = await sql`select ai_budget_status(${ORG}, ${CLIENT}, 'client', 'portal_chat') as s`
    check('state is hard once spent ≥ cap', s.state === 'hard', `${s.state} ${s.client.spent}`)
    const refused = await reserve(100)
    check('a new reserve is refused at the hard cap', refused.ok === false && refused.scope === 'client')
    await sql`insert into ai_budgets (org_id, scope, scope_id, period_month, cap_usd_micros, soft_pct, enabled, note)
              values (${ORG}, 'client', ${CLIENT}, date_trunc('month', now() at time zone 'utc')::date, 20000000, 80, true, 'test extend')`
    const extended = await reserve(101)
    check('after Extend to $20 this month, the reserve passes', extended.ok === true, JSON.stringify(extended))
    ;[{ s }] = await sql`select ai_budget_status(${ORG}, ${CLIENT}, 'client', 'portal_chat') as s`
    check('status now reads the dated $20 cap', s.client.cap === 20000000 && s.client.source === CLIENT && s.state === 'ok', `${s.client.cap} ${s.state}`)
    // a disabled dated row is ignored
    await sql`update ai_budgets set enabled = false where scope_id = ${CLIENT}`
    ;[{ s }] = await sql`select ai_budget_status(${ORG}, ${CLIENT}, 'client', 'portal_chat') as s`
    check('a disabled row is ignored → back to the $10 default', s.client.cap === 10000000)

    console.log('5. portal participant default ($3) and org ceiling')
    const portal = await reserve(200, { client: PORTAL_CLIENT, reserved: 3_500_000 })
    check('a $3.50 reserve for a portal participant is refused by default:portal ($3)', portal.ok === false && portal.cap === 3000000, JSON.stringify(portal))
    const portalOk = await reserve(201, { client: PORTAL_CLIENT, reserved: 2_000_000 })
    check('a $2 reserve for the participant passes', portalOk.ok === true)
    // org ceiling: temporarily set it to $12 → total client-principal spend already ~$12.6 → refuse
    await sql`update ai_budgets set cap_usd_micros = 12000000 where scope = 'org' and scope_id = ${ORG} and period_month is null`
    const orgRefused = await reserve(202, { client: PORTAL_CLIENT, reserved: 100_000 })
    check('the org ceiling refuses once total client-principal spend passes it', orgRefused.ok === false && orgRefused.scope === 'org', JSON.stringify(orgRefused))
    await sql`update ai_budgets set cap_usd_micros = 500000000 where scope = 'org' and scope_id = ${ORG} and period_month is null`

    console.log('6. feature cap (any principal) + stale release')
    await sql`insert into ai_budgets (org_id, scope, scope_id, period_month, cap_usd_micros, soft_pct, enabled, note) values (${ORG}, 'feature', 'scoring', null, 6000000, 80, true, 'test feature cap')`
    const feat = await reserve(300, { principal: 'system', purpose: 'scoring', feature: 'scoring', reserved: 2_000_000 })
    check('a $2 scoring reserve is refused by a $6 feature cap with $5 already reserved', feat.ok === false && feat.scope === 'feature', JSON.stringify(feat))
    await sql`update ai_usage set created_at = now() - interval '20 minutes' where status = 'reserved' and purpose = 'scoring' and coach_id = ${COACH}`
    const [{ n }] = await sql`select ai_release_stale(15) as n`
    check('ai_release_stale releases the 20-minute-old reservation', Number(n) >= 1, `${n}`)
    const feat2 = await reserve(301, { principal: 'system', purpose: 'scoring', feature: 'scoring', reserved: 2_000_000 })
    check('after the release the $2 scoring reserve passes', feat2.ok === true, JSON.stringify(feat2))

    console.log('7. alerts claim is unique per (kind, scope, month, threshold)')
    const period = s.period_month
    await sql`insert into ai_alerts (org_id, kind, scope_id, period_month, threshold) values (${ORG}, 'org_threshold', ${ORG}, ${period}, 50)`
    let dup = false
    try {
      await sql`insert into ai_alerts (org_id, kind, scope_id, period_month, threshold) values (${ORG}, 'org_threshold', ${ORG}, ${period}, 50)`
    } catch (e) {
      dup = e.code === '23505'
    }
    check('second claim for the same threshold is refused (23505)', dup)
    await sql`delete from ai_alerts where org_id = ${ORG} and kind = 'org_threshold' and threshold = 50 and period_month = ${period}`

    // cleanup
    await sql`delete from ai_usage where client_id in (${CLIENT}, ${PORTAL_CLIENT}) or coach_id = ${COACH}`
    await sql`delete from ai_budgets where scope_id in (${CLIENT}, ${PORTAL_CLIENT}, 'scoring')`
  } finally {
    await sql.end()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
