import { redirect } from 'next/navigation'

// Templates now live in the Library (note templates today; coaching agreements
// and worksheets to come). Keep this path working for old links/bookmarks.
export default function TemplatesPage() {
  redirect('/library')
}
