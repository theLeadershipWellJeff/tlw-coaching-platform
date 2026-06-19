/**
 * Server-side helpers for the agreement system. Keeps the get-or-create of a
 * coach's master template in one place (used by the Library editor route and the
 * issue flow) so the seed text is applied consistently.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgreementTemplate, Coach, Database } from './supabase/types'
import { seedTemplateContent } from './agreement-template'

/**
 * The coach's single master agreement template, creating it (seeded from
 * lib/agreement-template.ts) on first access. One row per coach is enforced by a
 * unique index, so a create race is resolved by re-reading.
 */
export async function getOrCreateAgreementTemplate(
  supabase: SupabaseClient<Database>,
  coach: Coach
): Promise<AgreementTemplate> {
  const { data: existing, error: readErr } = await supabase
    .from('agreement_templates')
    .select('*')
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (readErr) throw new Error(`Supabase (agreement_templates read): ${readErr.message}`)
  if (existing) return existing

  const seed = seedTemplateContent()
  const { data: created, error: insErr } = await supabase
    .from('agreement_templates')
    .insert({ coach_id: coach.id, name: 'Coaching Agreement', ...seed })
    .select('*')
    .single()
  if (insErr) {
    const { data: raced } = await supabase
      .from('agreement_templates')
      .select('*')
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (raced) return raced
    throw new Error(`Supabase (agreement_templates insert): ${insErr.message}`)
  }
  return created
}
