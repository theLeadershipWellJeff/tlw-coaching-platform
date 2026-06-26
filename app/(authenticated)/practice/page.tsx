import { PageHeader } from '@/app/components/layout/PageHeader'
import { ScorecardSpace } from './ScorecardSpace'
import { GrowthAreasSpace } from './GrowthAreasSpace'

export default function PracticePage() {
  return (
    <>
      <PageHeader
        title="Practice"
        subtitle="Your coaching craft, scored session by session against the ICF competencies and theLeadershipWell standards."
      />
      <ScorecardSpace />
      <GrowthAreasSpace />
    </>
  )
}
