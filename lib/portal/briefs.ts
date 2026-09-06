/**
 * Interpretation briefs (migration 059, `prompt_briefs`): the ONE place
 * instrument-specific guidance lives. One active row per slug per org; edited
 * from the command center without a deploy. The chat stamps the version it
 * used into `portal_messages.metadata` so engagement can be compared across
 * brief revisions.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type ActiveBrief = { slug: string; version: number; title: string; body: string }

export async function loadActiveBrief(orgId: string, slug: string): Promise<ActiveBrief | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('prompt_briefs')
    .select('slug, version, title, body')
    .eq('org_id', orgId)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return data ? { slug: data.slug, version: data.version, title: data.title, body: data.body } : null
}
