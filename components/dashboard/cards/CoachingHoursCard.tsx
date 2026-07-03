'use client'
import { CARD_META } from '@/lib/dashboard/cards'
import { CoachingHoursWidget } from '@/components/coaching-hours/CoachingHoursWidget'
import type { CardSize, DashboardCard } from '@/lib/dashboard/types'

function CoachingHours({ size }: { size: CardSize }) {
  return <CoachingHoursWidget compact={size === 'compact'} />
}

export const coachingHoursCard: DashboardCard<null> = {
  ...CARD_META['coaching-hours'],
  useData: () => null,
  render: ({ size }) => <CoachingHours size={size} />,
}
