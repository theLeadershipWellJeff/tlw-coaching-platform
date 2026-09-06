import { redirect } from 'next/navigation'

/** The debrief center moved under the Command Center's Client Portal page. */
export default function DebriefRedirect() {
  redirect('/command-center/portal')
}
