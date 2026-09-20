/**
 * The portal assistant's global kill switch. `AI_PORTAL_CHAT_ENABLED=false`
 * in Vercel disables every client-principal chat call at the route (no deploy,
 * no DB) — the brief's "instantly" lever. Absent or anything else = on.
 */
export function portalChatEnabled(): boolean {
  return (process.env.AI_PORTAL_CHAT_ENABLED || '').trim().toLowerCase() !== 'false'
}

export function portalChatOffMessage(): string {
  return 'The assistant is taking a short break. Your notes, goals, and sessions are all still here — please check back soon.'
}
