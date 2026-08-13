import type { ReactNode } from 'react'

export const metadata = {
  title: 'theLeadershipWell — Client Portal',
}

/**
 * Client Portal shell — deliberately separate from the coach app shell
 * (app/(authenticated)/layout). No coach navigation ever renders here.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-tlw-canvas text-tlw-espresso">{children}</div>
}
