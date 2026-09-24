# Portal Chat — Current State (2026-09-24)

Written as input for the **coach ↔ client portal connection** architecture
(BAE clients). This describes what the chat does **today**, read from the code on
`main` at this date. Sections 1–7 are facts. Sections 8–9 cover what does not
exist yet and the open design questions.

> Nothing in the repo mentions "BAE" today. The BAE clients would onboard through
> one of the existing portal paths (§2). Which path they take is the first
> decision to make (§9).

---

## 1. One-paragraph summary

The portal chat is a **client-only** AI reflection assistant at `/portal/chat`.
It is walled off from the coach app: the client signs in with a portal cookie
that carries only `clientId`. Every loader is scoped to that id. The assistant
reads the client's own material: goals, their 360, documents they uploaded,
their private journal, notes the coach actually **sent**, and transcript
excerpts. It never reads `key_info` or the coach's private `notes` table.
**The coach cannot see chat conversations today.** No coach route reads
`portal_conversations` or `portal_messages`. The only link from the coach side
is usage counts (`portal_events`) and budget spend.

---

## 2. Who can use it (access paths)

| Path | `client_type` | Coach link | Chat behaviour |
|---|---|---|---|
| Coaching client | `client` | real `coach_clients` link | `hasCoach = true`. The prompt says "not a replacement for your coach" and the contact card is **Contact your coach** |
| Coaching client + 360 | `client` + `portal_features.assessments = true` | real link | Same, plus 360 grounding |
| Standalone ZF participant | `portal`, no company | house-coach link (structural only) | `hasCoach = false`. The route is "Talk to a coach" or support |
| Enterprise participant | `portal` + `company_id` / `cohort_id` | house-coach link | Same as standalone, plus company vision, values and documents in the prompt |

- `hasCoach` = a `coach_clients` link **and** `client_type !== 'portal'`
  (`lib/portal/chat.ts`, same rule as the home page).
- Per-client switch: `portal_features.chat === false` → 403 `chat_off` (toggled
  in Command Center → Portal users → "Assistant"). The default is **on**.
- Global kill switch: `AI_PORTAL_CHAT_ENABLED=false` → 503.

---

## 3. Request flow (`POST /api/portal/chat`)

File: `app/api/portal/chat/route.ts` (`maxDuration 300`, Node runtime).

1. `getPortalClientId()` from the signed portal cookie. The request body never names a client.
2. Kill switch → rate limit (**6/min + 30/day**, `portal_access_log`) → per-client `chat` flag.
3. **Budget pre-check** (`ai_budget_status`):
   - hard cap → 429 `budget_exhausted` with the "resets on {date}" message, plus a coach notice
   - soft cap (≥80%) → the reply runs on the lighter `portal_degraded` model, plus a coach notice once a month
   - read error → 503 (fails closed)
4. The route checks conversation ownership, or creates a new conversation. The title is the first 48 characters of the message, or "Plan · week of …" in weekly-plan mode. An existing thread keeps its mode.
5. The user message is persisted. An attachment is stored only as a `📎 Attached: filename` marker. The attachment text goes into **this turn only** (capped at 30k characters).
6. `buildChatRequest` (`lib/portal/context.ts`) assembles the budgeted request (§4).
7. `portal_events` logs `chat_started`, `chat_message`, and a heuristic `comparison_viewed`.
8. The reply **streams** as plain text. The `X-Conversation-Id` / `X-Conversation-Mode` headers are set, plus `X-Context-Note` when the upload was trimmed.
9. When the stream finishes, the assistant turn is persisted with `metadata` (the brief slug and version, the assessment doc id, `has_comparison`, `mode`). The conversation's `updated_at` is then bumped.

Other routes:
- `GET /api/portal/chat` lists the client's threads (50, newest first).
- `GET /api/portal/chat/[id]` returns a thread's messages (ownership-checked).
- `POST /api/portal/chat/upload` extracts text from a PDF, Word or text file (4 MB, 20/h). **The file is not stored.**
- `POST /api/portal/weekly-plan/extract` and `POST /api/portal/weekly-plan` save the Top 5 from a plan thread, after the client confirms.

---

## 4. What the model sees (context assembly)

Three system blocks, sized by `lib/ai/context-budget.ts` under a **40k input-token ceiling**:

| Block | Cache | Budget | Contents (in order) |
|---|---|---|---|
| **Prefix** (cross-client) | 1 h | 12k | Preamble (client-agnostic) → `PORTAL_CHAT_VOICE_STANDARDS` → active `portal_chat` brief (rubrics/02) → *(if 360)* `ASSESSMENT_GROUNDING_RULES` + active `assessment_360` brief + ZF report guide + Strength Builder index → *(if company)* company vision, values and documents |
| **Snapshot** (this client) | 5 m | 14k | "WHO YOU ARE TALKING WITH" + human-route line (+ 360 status line) → compact 360 + verbatims → goals (with author and progress) → client-uploaded documents (16k chars) → **My notes** journal (8k) → **session notes the coach sent** (`communications.type='session_note'`, newest 20) → Strength Builder entries for the candidate competencies (last, so these are clipped first) |
| **Tail** (this question) | none | 10k excerpts | History summary + the newest 2 sessions' openings (2.5k chars each) + up to 12 passages ranked by `portal_chat_context` (transcripts + sent notes). **Never a full transcript** |
| Messages | — | 6k history + 6k current | The last 6 turns verbatim. Older turns are summarised once by Haiku (`background_compact`) and stored on `portal_conversations.history_summary*` (migration 071) |

- Drop order when over the ceiling: excerpts → history → snapshot. The prefix is never dropped.
- `aiCountTokens` measures the assembled request, then re-fits it (up to two rounds).
- Output cap: **4,000 tokens, thinking included**, effort `medium`.
- Model routing (`lib/ai/models.ts`): `portal_chat` → the frontier tier (Opus 5); `portal_degraded` → Sonnet 5. Overrides use `AI_MODEL_<PURPOSE>`.
- **Weekly-plan mode** (`mode='weekly_plan'`) swaps the persona for the `weekly_plan` brief and uses a compact 360 development summary, the last 4 plans, and 3 sent notes (`composeWeeklyPlanParts`).

**Never in context:** `clients.key_info`, the coach `notes` table, other clients' data, rater names, or any coach-internal field.

---

## 5. Data model

| Table / column | Purpose | Migration |
|---|---|---|
| `portal_conversations` (`id, client_id, org_id, title, mode, updated_at, history_summary, history_summary_through, history_summary_at`) | Threads | 045, 061, 071 |
| `portal_messages` (`conversation_id, org_id, role, content, metadata, created_at`) | Turns. `metadata` stamps the brief version | 045, 059 |
| `portal_events` | Outcome instrumentation (`chat_started`, `chat_message`, `comparison_viewed`, `talk_to_coach_clicked`, …) | 059 |
| `portal_access_log` | Audit + rate-limit counter | 053 |
| `prompt_briefs` | Versioned briefs (`portal_chat`, `assessment_360`, `weekly_plan`). One active per slug | 059 |
| `ai_usage` / `ai_budgets` / `ai_alerts` | Per-request cost ledger, caps, alerts | 069–070 |
| `weekly_plans` | Saved Top 5 per week | 061 |
| `portal_notes` | Client's private journal (fed to chat, never shown to the coach) | 063 |

No RLS policies. Everything goes through the service-role client, with isolation enforced in application code by `clientId`.

---

## 6. What the coach can see or do today

| Coach surface | What it exposes about the chat |
|---|---|
| Workspace `ws-ai-usage` "Assistant usage" | This month's portal spend vs cap, state (on track / lighter model / paused), **Extend** |
| Dashboard `ai-costs` card | Spend across the coach's own clients |
| Email alerts | Client soft/hard cap reached (once per kind per month) |
| Invite to portal button | Portal state: invited / last seen / locked |
| Command Center user page (supervisor) | `portal_events` timeline + usage tiles. **Counts, not content** |
| Command Center Brief tab (supervisor) | Edit the `portal_chat` / `assessment_360` / `weekly_plan` briefs. The change takes effect on the next message |

**Not available to the coach:** conversation list, message content, topics or
summaries, any flag raised by the chat, or any way to push content into a
thread.

Indirect coach → chat channels that already exist (the coach controls what the
assistant knows):
- **Send to client** (session notes) → enters the snapshot + retrieval
- `clients.coaching_goals` (coach-edited) → snapshot
- Transcripts filed on the client → excerpts + retrieval
- Documents with `visible_to_coach` → shared the other way (client → coach), not chat content

Indirect client → coach channels:
- **Contact your coach** (`POST /api/portal/contact`) → an email plus an inbound `communications` row
- "Save as a goal" from a chat reply → `coaching_goals` with `author:'client'` (visible in the coach's Goals card)
- Weekly plans and goal progress → the client's portal. Goal progress is shown read-only on the coach's GoalsCard

---

## 7. Guardrails already in place

- Portal cookie ≠ NextAuth session. `middleware.ts` guards `/portal/**`.
- Every chat route returns 404 (not 403) on another client's id.
- The assessment grounding floor: perception not ability, numbers only from the data, no rater attribution, no prescribing goals.
- Voice standards (`lib/writing-standards.ts#PORTAL_CHAT_VOICE_STANDARDS`).
- Human-route line: urgent, sensitive or clinical topics go to the coach or support. **This is prompt-only. Nothing detects these topics or alerts anyone.**
- Budget reservation fails closed. Stale reservations are released hourly.
- The build gate (`scripts/check-ai-imports.sh`) blocks any Anthropic SDK import outside `lib/ai/**`.

---

## 8. Gaps relevant to a coach ↔ client connection

1. **The coach cannot see chats.** There is no consent model for sharing them, no share-per-thread control, and no summary.
2. **Escalation is not detected.** The crisis/urgent line is advice in the prompt. There is no flag, no `coach_tasks` row, and no email.
3. **No coach → chat channel.** The coach cannot seed a prompt, assign a reflection, or attach a framework to a thread.
4. **No long-term memory.** The budget reserves a `MEMORY` slice (2k) but always leaves it empty. Each thread starts fresh apart from the snapshot.
5. **No chat content in the coach's session prep.** Plan-session / prep reads notes, goals and actions, never portal chats.
6. **Chats are not searchable.** `portal_search` covers transcripts + sent notes, not chat turns or My notes.
7. **The debrief coaches have no app access.** `cohorts.debrief_coach_name` is text only, so an enterprise cohort's coach cannot log in.
8. **Retention and deletion of chat content** are not defined (`DEBRIEF_DATA_HANDLING.md` covers documents, not threads).

---

## 9. Open decisions for the BAE architecture

| # | Decision | Options | Why it matters |
|---|---|---|---|
| 1 | Which access path do BAE users take? | coaching `client` vs enterprise `portal` + company/cohort | This sets `hasCoach`, the human-route copy, the budget default ($10 vs $3/month), and whether company docs enter the prompt |
| 2 | Who is "the coach" for BAE? | Jeff (house) / a named contract coach with an app login / a debrief coach (text only) | The `coach_clients` link drives the gates, alerts and ownership |
| 3 | What can the coach see of the chat? | nothing (today) / client shares a thread / AI summary with consent / full access | Confidentiality promise, `/portal/privacy` copy, sponsor procurement |
| 4 | Can the sponsor company see anything? | none / aggregate counts only | The non-goal today: "no sponsor dashboards" |
| 5 | Escalation | prompt-only (today) / classifier → `coach_tasks` / email | Duty of care. `coach_tasks.task_type` is open text, so a new type needs no migration |
| 6 | Coach → client push | none / assigned prompts / pinned frameworks per thread | Needs a new column or table on `portal_conversations` |
| 7 | Memory | none / per-client rolling memory filling the `MEMORY` slice | The token budget already reserves space for it |

**Would be wrong if:** a coach-side route that reads `portal_messages`, or any
BAE-specific code, has landed on `main` after 2026-09-24.
**How to check:** `grep -rn "portal_messages\|portal_conversations" app lib` and
look for anything outside `app/api/portal/**`, `lib/portal/**` and the briefs
admin route.

---

### Key files

`app/api/portal/chat/route.ts` · `app/api/portal/chat/[id]/route.ts` ·
`app/api/portal/chat/upload/route.ts` · `app/portal/chat/page.tsx` ·
`lib/portal/chat.ts` · `lib/portal/context.ts` · `lib/portal/prompt.ts` ·
`lib/ai/context-budget.ts` · `lib/ai/models.ts` · `lib/ai/budget.ts` ·
`lib/portal/briefs.ts` · `lib/portal/access.ts` · `lib/portal/events.ts` ·
`rubrics/02` (chat) · `rubrics/03` (weekly plan) · `rubrics/04` (360)
