# Agents for theLeadershipWell app

Three Claude Code subagents work as staff to Jeff on the app and client portal.
They live in `.claude/agents/` and are invoked from a normal Claude Code session
in this repo. Caleb (CEO of the software line) directs the non-coding side of
the product through Jeff; the agents never contact anyone on their own.

## Who does what

| Agent | Seat | Use it for | Does not |
|---|---|---|---|
| `cto` | Staff to Jeff (CTO) | Architecture reviews, security, client confidentiality (PII, transcripts, tenant isolation — see `ISOLATION_AUDIT.md`), technical debt, decision memos (ADRs) in `docs/decisions/` | Edit app code, deploy, run production migrations, rotate secrets |
| `vp-product` | Staff to Jeff (VP Product) | Roadmap, specs and build briefs, Linear hygiene (app + portal only), user-facing copy against Writing Standards §5.11, drafting notes for Jeff to send Caleb (pricing, go-to-market, feedback, beta coaches) | Edit app code, contact Caleb or coaches directly |
| `vp-eng` | Staff to Jeff (engineering) | Writing, fixing, and reviewing code; migrations as copy/paste SQL; preparing releases | Merge to `main`, deploy, or apply production migrations without Jeff's go-ahead |

## How to invoke

Ask in plain language from the main session:

- "Use the **cto** agent to review the new portal upload route for isolation gaps."
- "Use the **cto** agent to write an ADR on moving tenant isolation into RLS."
- "Use the **vp-product** agent to draft a spec for the coaching-map view."
- "Use the **vp-product** agent to draft a note to Caleb summarizing beta-coach feedback."
- "Use the **vp-eng** agent to fix the nudge scheduling bug and prepare the migration SQL."

A typical flow: vp-product writes the brief → cto reviews the design for risk →
vp-eng builds it → cto reviews the diff → Jeff approves the merge and deploy.

## Authority tiers (all agents)

- **Tier 0 — freely:** read, analyze, run local checks.
- **Tier 1 — do, then report:** draft docs, specs, ADRs; vp-eng edits code on a working branch.
- **Tier 2 — Jeff's explicit approval, every time:** merge to `main` (production builds from it), deploy, production migrations, changing Linear, contacting anyone.
- **Tier 3 — never:** move money, change Stripe live settings or charge customers, delete data, expose client data, send messages to clients.
