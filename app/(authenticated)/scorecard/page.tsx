import { PageHeader } from '@/app/components/layout/PageHeader'
import { ScorecardSpace } from './ScorecardSpace'

export default function ScorecardPage() {
  return (
    <>
      <PageHeader
        title="Scorecard"
        subtitle="Your coaching craft, scored session by session against the ICF competencies and theLeadershipWell standards."
      />
      <ScorecardSpace />
    </>
  )
}
