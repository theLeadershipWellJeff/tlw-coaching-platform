import { PageHeader } from '@/app/components/layout/PageHeader'
import { PrepQueue } from './PrepQueue'

export default function PrepPage() {
  return (
    <>
      <PageHeader
        title="Prep Sheets"
        subtitle="Session prep drafted ahead of time. Review and approve, and it lands with the client two days before the session — nothing goes out without you."
      />
      <PrepQueue />
    </>
  )
}
