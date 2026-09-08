import { PageHeader } from '@/app/components/layout/PageHeader'
import { DashboardSurface } from '@/components/dashboard/DashboardSurface'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach, coachGreetingName } from '@/lib/coach'
import { WelcomeChecklist } from './WelcomeChecklist'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The name the greeting uses — the coach's own choice from Account → Profile. */
async function greetingName(): Promise<string> {
  try {
    const coach = await getSessionCoach(getSupabaseAdmin())
    return coachGreetingName(coach)
  } catch {
    return 'there'
  }
}

export default async function DashboardPage() {
  const name = await greetingName()
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
      {/* One unified, arrangeable board: roster, Up next, scorecard, and every
          other tile are cards you can add, size, and drag to reorder. */}
      <DashboardSurface />
    </>
  )
}
