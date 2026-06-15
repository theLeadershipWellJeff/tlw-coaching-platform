import { SessionReportView } from './SessionReportView'

export default function SessionReportPage({ params }: { params: { id: string } }) {
  return <SessionReportView id={params.id} />
}
