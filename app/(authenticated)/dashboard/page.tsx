import { PageHeader } from '@/app/components/layout/PageHeader'
import { DashboardSurface } from '@/components/dashboard/DashboardSurface'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach, coachGreetingName } from '@/lib/coach'
import { WelcomeChecklist } from './WelcomeChecklist'
import { NeedsAttentionPanel } from './NeedsAttentionPanel'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The greeting name (the coach's own choice from Account → Profile) + their timezone. */
async function coachBits(): Promise<{ name: string; timeZone: string }> {
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    return { name: coachGreetingName(coach), timeZone: coach?.timezone || 'America/Los_Angeles' }
  } catch {
    return { name: 'there', timeZone: 'America/Los_Angeles' }
  }
}

export default async function DashboardPage() {
  const { name, timeZone } = await coachBits()
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <PageHeader eyebrow="theLeadershipWell" title={`${greeting()}, ${name}`} subtitle={today} guide="dashboard" />
      {/* First-run setup checklist — only visible while the roster is empty. */}
      <WelcomeChecklist />
      {/* The coach attention queue — always mounted (not an opt-in card), one
          quiet line when empty. */}
      <NeedsAttentionPanel timeZone={timeZone} />
      {/* One unified, arrangeable board: roster, Up next, scorecard, and every
          other tile are cards you can add, size, and drag to reorder. */}
      <DashboardSurface />
    </>
  )
}
