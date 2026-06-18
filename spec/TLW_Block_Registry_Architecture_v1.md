# Block Registry & Config-Driven Rendering — Architecture Spec

*Owner: Dr. Jeff Holmes | Status: approved, build from here (Tier 1, Phase 1B)*

> **Origin:** drafted as a drop-in section for `TLW_Platform_Build_Brief_v2.md`.
> Purpose: build the *rendering seam* now (Phase 1B) so per-coach customization
> becomes a cheap add-on in Phase 3 — without building any of the Phase 3
> customization machinery today.

---

## 1. The principle (and the boundary)

We are building **one thing now**: the client page renders itself from a **layout config** + a **registry of pre-built blocks**, instead of hard-coded JSX. That is the only seam that is expensive to retrofit later.

We are **explicitly not** building: an AI dialogue box, natural-language → spec translation, a preview/confirm flow, drag-and-drop layout editing, or any per-coach customization UI. All of that is Phase 3, and all of it later resolves to *"writing a layout row,"* which the architecture below already supports.

**The LEGO analogy, made literal:** Jeff + Claude Code keep building **bricks** (registry blocks) at build-time. A future dialogue system will let coaches **arrange existing bricks** at run-time. Today we only build the brick *system* and the first two bricks we were already going to build anyway.

---

## 2. Scope tiers

| Tier | What | Build when |
|---|---|---|
| **Tier 1 — build now (1B)** | Slot model, block registry, `SurfaceRenderer`, default layout (in code), placement validator, Note Editor + Actions/Insights panel built **as blocks** | This 1B cycle |
| **Tier 2 — cheap, optional now** | `workspace_layouts` table + per-coach override loading. The renderer already calls `loadLayout()`; until Tier 2 ships, that function just returns the default. | Now if it doesn't slow 1B; otherwise defer — it's a small add later |
| **Tier 3 — DO NOT BUILD (Phase 3)** | Dialogue box, NL→spec translation, validate-on-write at the customization boundary, preview, confirm, customization UI, feature-request escalation | Phase 3 only |

The whole point: **Tier 1 is the commitment.** Tiers 2 and 3 are seams we *reserve*, not things we build.

---

## 3. Slot model

A **slot** is a named, layout-safe region of a surface. Blocks may only mount into defined slots — never arbitrary positions. This is what keeps layout and accessibility from breaking when arrangement changes.

```ts
// lib/blocks/slots.ts
export type SlotId =
  | "client.header"
  | "client.main"
  | "client.sidebar";

export const SLOTS: Record<string, SlotId[]> = {
  client_detail: ["client.header", "client.main", "client.sidebar"],
};
```

The page shell (`SurfaceShell`) owns the visual layout of these regions (grid, responsive collapse, mobile stacking). Blocks know nothing about layout — they just render inside whatever slot they're placed in.

---

## 4. The block contract

Every block is a self-contained React component receiving one typed envelope. This is what makes blocks interchangeable.

```ts
// lib/blocks/types.ts
import { z } from "zod";

export interface BlockContext {
  coachId: string;   // scope — a block must NEVER read outside this coach
  clientId: string;
  surface: string;
}

export interface BlockProps<TConfig = unknown> {
  clientId: string;
  config: TConfig;
  context: BlockContext;
}

export interface BlockDefinition<TConfig = unknown> {
  id: string;                 // stable, e.g. "actions-insights-panel"
  name: string;               // human label
  description: string;
  version: number;            // bump on breaking config changes
  allowedSlots: SlotId[];     // where it may mount
  configSchema: z.ZodType<TConfig>;
  defaultConfig: TConfig;
  requires: string[];         // capabilities it depends on (see §9)
  component: React.ComponentType<BlockProps<TConfig>>;
}
```

**Hard rule:** a block accesses data only through its `context` scope. Every query a block fires is filtered by `context.coachId`. No block ever reaches another coach's clients. (This is the tenant-isolation guarantee, enforced structurally rather than by trust.)

---

## 5. The registry (single source of truth for "what blocks exist")

```ts
// lib/blocks/registry.ts
import dynamic from "next/dynamic";
import { z } from "zod";
import type { BlockDefinition } from "./types";

const actionsInsightsSchema = z.object({
  showActions: z.boolean().default(true),
  showInsights: z.boolean().default(true),
  maxItems: z.number().int().min(1).max(50).default(20),
});

const noteEditorSchema = z.object({
  autosaveMs: z.number().int().min(500).max(10000).default(1500),
});

export const BLOCKS: Record<string, BlockDefinition<any>> = {
  "note-editor": {
    id: "note-editor",
    name: "Session Notes",
    description: "Rich-text note editor with inline ACTION:/INSIGHT: semantic tagging.",
    version: 1,
    allowedSlots: ["client.main"],
    configSchema: noteEditorSchema,
    defaultConfig: { autosaveMs: 1500 },
    requires: ["notes.write", "notes.semantic-tagging"],
    component: dynamic(() => import("@/components/blocks/NoteEditor")),
  },
  "actions-insights-panel": {
    id: "actions-insights-panel",
    name: "Actions & Insights",
    description: "Live panel of actions and insights extracted from session notes.",
    version: 1,
    allowedSlots: ["client.sidebar"],
    configSchema: actionsInsightsSchema,
    defaultConfig: { showActions: true, showInsights: true, maxItems: 20 },
    requires: ["notes.read", "notes.semantic-tagging"],
    component: dynamic(() => import("@/components/blocks/ActionsInsightsPanel")),
  },
};
```

**Adding a future block = one registry entry + one component file. Zero edits to any page.** That property is the whole win.

---

## 6. Layout config & the default layout

A **placement** maps a block into a slot with its config.

```ts
// lib/blocks/types.ts (cont.)
export interface Placement {
  block: string;                    // block id
  slot: SlotId;
  config: Record<string, unknown>;  // merged over the block's defaultConfig
  enabled: boolean;
}
```

The **default layout** lives in code and is the source of truth when no per-coach override exists. In single-tenant 1B, this is the only layout that ever renders.

```ts
// lib/blocks/defaultLayouts.ts
export const DEFAULT_LAYOUTS: Record<string, Placement[]> = {
  client_detail: [
    { block: "note-editor",            slot: "client.main",    config: {}, enabled: true },
    { block: "actions-insights-panel", slot: "client.sidebar", config: {}, enabled: true },
  ],
};
```

---

## 7. The validator (build now — it's correctness, not customization)

The renderer must never trust a placement blindly, even one read from our own DB. This function is reused later by the Phase 3 validate-on-write step, but it earns its place now as graceful degradation.

```ts
// lib/blocks/validate.ts
import { BLOCKS } from "./registry";
import type { Placement, BlockDefinition } from "./types";

export function resolvePlacement(p: Placement):
  | { ok: true; def: BlockDefinition; config: unknown }
  | { ok: false; reason: string } {
  const def = BLOCKS[p.block];
  if (!def) return { ok: false, reason: `unknown block: ${p.block}` };
  if (!def.allowedSlots.includes(p.slot))
    return { ok: false, reason: `${p.block} not allowed in ${p.slot}` };
  const parsed = def.configSchema.safeParse({ ...def.defaultConfig, ...p.config });
  if (!parsed.success) return { ok: false, reason: "invalid config" };
  return { ok: true, def, config: parsed.data };
}
```

---

## 8. The renderer

```tsx
// components/SurfaceRenderer.tsx
import { SLOTS } from "@/lib/blocks/slots";
import { resolvePlacement } from "@/lib/blocks/validate";
import type { Placement, SlotId } from "@/lib/blocks/types";

export function SurfaceRenderer({
  surface, clientId, coachId, layout,
}: {
  surface: string; clientId: string; coachId: string; layout: Placement[];
}) {
  const enabled = layout.filter((p) => p.enabled);
  const bySlot: Record<string, Placement[]> = {};
  for (const p of enabled) (bySlot[p.slot] ??= []).push(p);

  return (
    <SurfaceShell surface={surface}>
      {(SLOTS[surface] ?? []).map((slot: SlotId) => (
        <SlotRegion key={slot} slot={slot}>
          {(bySlot[slot] ?? []).map((p, i) => {
            const r = resolvePlacement(p);
            if (!r.ok) return null; // skip gracefully — forward compatible
            const Block = r.def.component;
            return (
              <Block
                key={`${p.block}-${i}`}
                clientId={clientId}
                config={r.config}
                context={{ coachId, clientId, surface }}
              />
            );
          })}
        </SlotRegion>
      ))}
    </SurfaceShell>
  );
}
```

The page file becomes thin — it resolves the coach + client, loads the layout, and hands off:

```tsx
// app/clients/[clientId]/page.tsx
const coachId = await getCoachIdFromSession();      // from NextAuth session
const layout = await loadLayout(coachId, "client_detail");
return <SurfaceRenderer surface="client_detail" clientId={params.clientId} coachId={coachId} layout={layout} />;
```

---

## 9. How blocks cooperate (the Note Editor ↔ Panel case)

The editor and the panel must stay in sync (typing `ACTION:` in the editor surfaces it in the panel). **Blocks never talk to each other directly.** They share *client-scoped data*: the editor **writes** action/insight records on tag detection; the panel **subscribes** to the same records (React Query / SWR invalidation, or Supabase realtime on the actions/insights table).

This keeps blocks independent and swappable — the "shared state" is just the data layer, scoped by `coachId` + `clientId`, not block-to-block coupling. It also matches the existing principle that **notes are the single source of truth** for actions/insights.

---

## 10. Tier 2 — per-coach override (cheap, optional now)

```sql
create table workspace_layouts (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null,
  surface    text not null,
  layout     jsonb not null,
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  unique (coach_id, surface)
);
```

```ts
// reads override if present, else falls back to the in-code default
export async function loadLayout(coachId: string, surface: string): Promise<Placement[]> {
  const row = await db.from("workspace_layouts")
    .select("layout").eq("coach_id", coachId).eq("surface", surface).maybeSingle();
  return (row?.data?.layout as Placement[]) ?? DEFAULT_LAYOUTS[surface] ?? [];
}
```

> **Stack note (important):** this app is on **NextAuth**, not Supabase Auth. Supabase RLS keyed to `auth.uid()` will **not** work out of the box unless we mint Supabase JWTs. The non-negotiable isolation guarantee is therefore **server-side filtering by the session `coachId` on every query** (already true in §4). Treat Supabase RLS as optional belt-and-suspenders *only if* we later wire Supabase JWTs — don't rely on it as the primary boundary.

Until Tier 2 ships, `loadLayout()` can simply `return DEFAULT_LAYOUTS[surface]`. The function signature is the seam; the table is deferrable.

---

## 11. Reserved seams for Phase 3 (build nothing now)

The future dialogue system resolves entirely to: **produce a `Placement`, validate it with `resolvePlacement()`, write a `workspace_layouts` row.** That means Phase 3 only ever *adds* (a) an AI translate step, (b) a preview render of a candidate layout, (c) a confirm action, (d) a feature-request capture when a request needs a block the registry doesn't have. None of these touch the Tier 1 architecture. **That is the payoff for building the seam now.**

---

## 12. Non-goals (do NOT build this cycle)

- AI/dialogue customization box of any kind
- Natural-language → spec translation
- Preview / confirm / undo customization flows
- Drag-and-drop layout editor
- Any block beyond the two already planned for 1B
- Validate-on-*write* customization boundary (the *read*-side validator in §7 is in scope; the write-side guard is Phase 3)

---

## 13. Acceptance criteria (definition of done for Tier 1)

1. `app/clients/[clientId]/page.tsx` contains **no hard-coded block JSX** — it only loads a layout and renders `SurfaceRenderer`.
2. `BLOCKS` registry is the single source of truth; adding a block requires **one registry entry + one component**, with no page edits.
3. Note Editor and Actions/Insights panel are both implemented **as registry blocks**, mounted via the default layout.
4. Editor → panel sync works through shared client-scoped data, not direct coupling.
5. Unknown, disabled, or invalid placements are **skipped without breaking the page**.
6. Every block's data access is filtered by `coachId` from the session — no cross-coach reads possible.
7. The page renders correctly with **zero** customization data present (default layout only).

---

## 14. Open decisions (resolve before / during the Code session)

| # | Decision | Recommendation |
|---|---|---|
| 1 | Is the Note Editor itself a block, or a fixed shell with only the sidebar as a block? | **Editor is a block too** — same build effort now, fully config-driven page, zero retrofit |
| 2 | Add `workspace_layouts` (Tier 2) now or defer? | Build `loadLayout()` now; let it return the default. Add the table only if it doesn't slow 1B |
| 3 | `next/dynamic` lazy-load vs static import for blocks | Lazy-load (`next/dynamic`) — keeps the client bundle lean as the catalog grows |
| 4 | Block-id naming convention | `kebab-case`, noun-first (`actions-insights-panel`); never reuse an id across breaking versions |

---

## 15. Claude Code handoff prompt (paste-ready)

> Refactor the client detail page (`app/clients/[clientId]`) to render from a block registry instead of hard-coded JSX, per the Block Registry spec. Create: `lib/blocks/slots.ts`, `lib/blocks/types.ts`, `lib/blocks/registry.ts`, `lib/blocks/defaultLayouts.ts`, `lib/blocks/validate.ts`, a `loadLayout()` helper (returns the in-code default for now — no DB table yet), and `components/SurfaceRenderer.tsx` with `SurfaceShell` + `SlotRegion`. Build the Note Editor (rich text; bold/italic/H1/H2/indent/outdent; Tab captured as indent; inline case-insensitive `ACTION:`/`INSIGHT:` tagging) and the Actions/Insights panel **as two registry blocks** (`note-editor` in `client.main`, `actions-insights-panel` in `client.sidebar`). They must sync via shared client-scoped data (editor writes records; panel subscribes), not direct coupling. Every block query must be filtered by the session `coachId`. The page file must contain no hard-coded block JSX. Do NOT build any customization dialogue, preview, or per-coach editing UI — that is out of scope. Confirm the plan and list files you'll create before writing code.

---

## Changelog entry for the brief

- **[Architecture]** Adopted config-driven rendering for `client_detail` via a block registry + slot model (Tier 1, Phase 1B). Note Editor and Actions/Insights panel to be built as the first two registry blocks. Per-coach layout overrides (`workspace_layouts`) reserved as Tier 2; AI customization dialogue reserved for Phase 3. Rationale: build the expensive-to-retrofit rendering seam now; defer all customization machinery.

---

## Reconciling with the existing codebase (notes for the build)

The spec above is written generically; a few names map onto how this repo already works. Read these before implementing so the seam fits the current code rather than fighting it:

- **`coachId` resolution.** This app resolves the coach via `getOrCreateCoach()` keyed on the signed-in Google email (NextAuth session). Use that to derive `coachId`/`getCoachIdFromSession()` — don't introduce a parallel auth path.
- **Data access stays server-side.** Blocks are client components, but their data must come through server route handlers / server components that use `getSupabaseAdmin()`. Per CLAUDE.md, **never import the admin client from a `"use client"` file.** The "every query filtered by `coachId`" rule is enforced in those server handlers, not in the client block.
- **Notes = single source of truth.** The §9 editor↔panel sync already exists in spirit: `lib/notes/sync-actions.ts#syncNoteActions` reconciles a note's `ACTION:` lines into the `actions` table on save. The Actions/Insights panel block should subscribe to that same data, not a new parallel store.
- **The current client workspace** lives at `app/(authenticated)/clients/[id]` (route param is `id`, not `clientId`) with `NotesPanel.tsx`, `RichNoteEditor`, and the capture rail already built. Tier 1 reframes those existing pieces as registry blocks; it is a refactor of working code, not a greenfield build.
- **Supabase types are hand-written** in `lib/supabase/types.ts`. A Tier 2 `workspace_layouts` table needs a matching hand-written type and a numbered migration in `supabase/migrations/` (next free number after 014), applied by hand in the Supabase SQL editor.
