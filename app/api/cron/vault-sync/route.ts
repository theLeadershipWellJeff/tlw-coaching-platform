import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { syncFrameworks } from '@/lib/vault/sync'
import { getVaultConfig } from '@/lib/vault/client'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Vault sync cron. Vercel Cron hits this hourly. Re-indexes every coach who has a
 * vault folder configured. The per-file blob-SHA skip makes an unchanged vault
 * nearly free (one tree read, no blob fetches), so running hourly is cheap.
 *
 * Protected by CRON_SECRET (Bearer), same as the other crons. No-ops cleanly when
 * the vault credential isn't configured.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!getVaultConfig()) return NextResponse.json({ synced: 0, skipped: 'vault not configured' })

  const supabase = getSupabaseAdmin()
  // Only coaches who've pointed at a folder (vault_folder_path set in nudge_settings).
  const { data: coaches } = await supabase
    .from('coaches')
    .select('id, nudge_settings')
    .not('nudge_settings', 'is', null)

  let synced = 0
  let indexed = 0
  for (const c of coaches || []) {
    const folder = (c.nudge_settings as any)?.vault_folder_path
    if (!folder || typeof folder !== 'string') continue
    try {
      const result = await syncFrameworks(supabase, c.id)
      if (result.configured) {
        synced++
        indexed += result.indexed
      }
    } catch (e: any) {
      console.error(`Vault sync failed for coach ${c.id}:`, e?.message || e)
    }
  }

  return NextResponse.json({ synced, indexed })
}
