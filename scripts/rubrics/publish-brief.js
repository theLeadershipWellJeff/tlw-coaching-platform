// Publish a rubric's "Brief body" section from rubrics/*.md to the live
// prompt_briefs table as a NEW, ACTIVE version — the same thing the Command
// Center's Brief tab does, from the file in the repo instead of a paste.
//
//   node scripts/rubrics/publish-brief.js portal_chat       # rubrics/02
//   node scripts/rubrics/publish-brief.js weekly_plan       # rubrics/03
//   node scripts/rubrics/publish-brief.js assessment_360    # rubrics/04
//   node scripts/rubrics/publish-brief.js assessment_360 --dry-run
//   node scripts/rubrics/publish-brief.js assessment_360 --sql   # print an idempotent SQL block instead
//                                                                 # (paste into the Supabase SQL editor — for
//                                                                 # sessions without database credentials)
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_API_SECRET_KEY in the environment
// (read from .env.local when present). Publishes to the first organization
// unless --org <uuid> is given. Old versions are kept; roll back from the Brief
// tab by activating an older one.
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const FILES = {
  portal_chat: 'rubrics/02_portal_coaching_chat_rubric.md',
  weekly_plan: 'rubrics/03_goal_setting_rubric.md',
  assessment_360: 'rubrics/04_zf360_report_interpretation_rubric.md',
}

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

/** The text between `<!-- BEGIN BRIEF BODY -->` and `<!-- END BRIEF BODY -->`. */
function extractBriefBody(md) {
  const a = md.indexOf('<!-- BEGIN BRIEF BODY -->')
  const b = md.indexOf('<!-- END BRIEF BODY -->')
  if (a < 0 || b < 0 || b < a) throw new Error('BRIEF BODY markers not found')
  return md.slice(a + '<!-- BEGIN BRIEF BODY -->'.length, b).replace(/^\s*```[a-z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
}

function extractTitle(md) {
  const m = md.match(/^\*\*Brief title:\*\*\s*(.+)$/m)
  return m ? m[1].trim() : null
}

/**
 * An idempotent SQL block that makes `body` the ACTIVE version of `slug` for
 * every organization: a version already carrying this exact body is
 * re-activated (so re-running after the down-script restores it, and a
 * re-run on an already-published org is a no-op); otherwise a new version is
 * inserted and activated. Dollar-quoted with a tag that cannot appear in the
 * body.
 */
function briefSql(slug, title, body, sourceFile) {
  const tag = '$brief$'
  if (body.includes(tag) || title.includes("'")) throw new Error('body contains the dollar-quote tag or title contains a quote')
  return `-- ${slug}: make the BRIEF BODY of ${sourceFile} the active version
-- (re-activates an existing version with this body; else inserts the next version).
DO $do$
DECLARE
  o RECORD;
  match_version int;
  match_active boolean;
  next_version int;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM prompt_briefs UNION SELECT id FROM organizations LOOP
    SELECT version, is_active INTO match_version, match_active FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = '${slug}' AND btrim(body) = btrim(${tag}${body}${tag})
      ORDER BY version DESC LIMIT 1;
    IF match_version IS NOT NULL THEN
      IF NOT match_active THEN
        UPDATE prompt_briefs SET is_active = false
          WHERE org_id = o.org_id AND slug = '${slug}' AND is_active;
        UPDATE prompt_briefs SET is_active = true
          WHERE org_id = o.org_id AND slug = '${slug}' AND version = match_version;
      END IF;
      CONTINUE;
    END IF;
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM prompt_briefs
      WHERE org_id = o.org_id AND slug = '${slug}';
    UPDATE prompt_briefs SET is_active = false
      WHERE org_id = o.org_id AND slug = '${slug}' AND is_active;
    INSERT INTO prompt_briefs (org_id, slug, version, title, body, is_active)
      VALUES (o.org_id, '${slug}', next_version, '${title}', ${tag}${body}${tag}, true);
  END LOOP;
END
$do$;
`
}

async function main() {
  const args = process.argv.slice(2)
  const slug = args.find((a) => !a.startsWith('--'))
  if (!slug || !FILES[slug]) {
    console.error(`usage: node scripts/rubrics/publish-brief.js <${Object.keys(FILES).join('|')}> [--dry-run] [--org <uuid>]`)
    process.exit(2)
  }
  const dryRun = args.includes('--dry-run')
  const orgArg = args[args.indexOf('--org') + 1]
  const md = fs.readFileSync(path.join(ROOT, FILES[slug]), 'utf8')
  const body = extractBriefBody(md)
  const title = extractTitle(md) || `${slug} brief (from ${FILES[slug]})`
  if (body.length < 40) throw new Error('brief body is too short to be useful')

  if (args.includes('--sql')) {
    process.stdout.write(briefSql(slug, title, body, FILES[slug]))
    return
  }
  console.log(`slug: ${slug}\ntitle: ${title}\nbody: ${body.length} chars from ${FILES[slug]}`)
  if (dryRun) {
    console.log('\n--- body ---\n' + body)
    return
  }

  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_API_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_API_SECRET_KEY are required (or use --dry-run)')
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let orgId = orgArg && args.includes('--org') ? orgArg : null
  if (!orgId) {
    const { data, error } = await supabase.from('organizations').select('id').order('created_at').limit(1).maybeSingle()
    if (error || !data) throw new Error(`could not resolve an organization: ${error?.message || 'none found'}`)
    orgId = data.id
  }

  const { data: versions } = await supabase.from('prompt_briefs').select('version, body, is_active').eq('org_id', orgId).eq('slug', slug).order('version', { ascending: false })
  const existing = (versions || []).find((v) => v.body.trim() === body)
  if (existing) {
    if (existing.is_active) {
      console.log(`no change: v${existing.version} already carries this body and is active`)
      return
    }
    const { error: deact } = await supabase.from('prompt_briefs').update({ is_active: false }).eq('org_id', orgId).eq('slug', slug).eq('is_active', true)
    if (deact) throw new Error(deact.message)
    const { error: react } = await supabase.from('prompt_briefs').update({ is_active: true }).eq('org_id', orgId).eq('slug', slug).eq('version', existing.version)
    if (react) throw new Error(react.message)
    console.log(`re-activated ${slug} v${existing.version} (it already carried this body)`)
    return
  }
  const version = (versions?.[0]?.version || 0) + 1
  const { error: deact } = await supabase.from('prompt_briefs').update({ is_active: false }).eq('org_id', orgId).eq('slug', slug).eq('is_active', true)
  if (deact) throw new Error(deact.message)
  const { error } = await supabase.from('prompt_briefs').insert({ org_id: orgId, slug, version, title, body, is_active: true })
  if (error) throw new Error(error.message)
  console.log(`published ${slug} v${version} (active) to org ${orgId}`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
