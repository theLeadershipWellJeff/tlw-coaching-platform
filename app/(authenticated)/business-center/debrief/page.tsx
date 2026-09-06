import { redirect } from 'next/navigation'

/** The debrief center moved under the Client Portal admin page. */
export default function DebriefRedirect() {
  redirect('/business-center/portal')
}
