# theLeadershipWell — Design Guidelines v1

The design system for the theLeadershipWell coaching platform. This is the
single reference for color, type, spacing, motion, and component patterns.
Everything below is drawn from what's actually implemented — `tailwind.config.js`,
`app/globals.css`, and the recurring component patterns across `app/` and
`components/`. Keep it in sync when tokens change.

> **Source of truth for tokens:** `tailwind.config.js` (utility classes) and
> `app/globals.css` (CSS custom properties) hold the canonical values. The
> Session Report surface has its own semantic layer — see §3 and
> `spec/theLeadershipWell_Session_Report_Spec_v0.4.md` §4 / §13.

---

## 1. Design principles

The product should feel **calm, confident, and document-like** — an executive
coaching tool, not a consumer dashboard.

- **Flat surfaces.** No gradients, no drop shadows, no decorative effects. Depth
  comes from a two-tier surface system (white cards on a warm canvas) and
  hairline borders, not shadow.
- **Restraint with color.** The palette is near-monochrome navy/warm-gray/cream.
  **Signal Orange is the one permitted accent** and carries meaning only —
  never decoration. In the scorecard, color carries *only* status and scoring
  band.
- **Sentence case everywhere.** No Title Case in prose, no ALL CAPS — except the
  small uppercase-tracked eyebrow/label pattern (§4).
- **Two type weights carry most of the UI** — regular (400) and medium (500).
  Reserve 600/700 for headings and figures.
- **Numbers are the hero.** On any card, the figure is the largest type; its
  label is small and muted.
- **Generous whitespace + hairline dividers.** Sections breathe; separation is a
  thin border, not a heavy rule.
- **Progressive disclosure.** Cards read at a glance in compact form and reveal
  detail on resize / drill-down.

---

## 2. Color system

### 2.1 Brand tokens

Defined in `tailwind.config.js` (as `tlw-*` utilities) and mirrored as CSS
variables in `app/globals.css`.

| Token | Hex | Utility | Role |
|-------|-----|---------|------|
| Navy Deep | `#111226` | `tlw-navy-deep` | Primary ink, headings, primary buttons |
| Navy Rich | `#0C1940` | `tlw-navy-rich` | Primary action fills, active toggles, chart marks |
| Cream | `#F2F2F0` | `tlw-cream` | Canvas / light fill (alias of Canvas) |
| Warm Gray | `#8B8680` | `tlw-warm-gray` | Secondary/muted text, labels, borders |
| Espresso | `#403832` | `tlw-espresso` | Body text (softer than navy) |
| Near Black | `#0D0D0D` | `tlw-near-black` | Deepest ink when needed |
| **Signal Orange** | **`#E8650A`** | `tlw-signal-orange` | **The one accent** — see §2.3 |
| Surface | `#FFFFFF` | `tlw-surface` | Card / elevated surface |
| Canvas | `#F2F2F0` | `tlw-canvas` | Page background / recessed fill |

### 2.2 Derived tints & borders

From `app/globals.css` — use these rather than inventing new alphas:

```
--tlw-border-strong:      rgba(139,134,128,0.40)   /* 8B8680 @ 40% */
--tlw-border-default:     rgba(139,134,128,0.25)
--tlw-border-subtle:      rgba(139,134,128,0.15)
--tlw-orange-tint:        rgba(232,101,10,0.08)     /* Signal Orange wash */
--tlw-orange-tint-strong: rgba(232,101,10,0.06)
--tlw-navy-tint:          rgba(12,25,64,0.06)
```

In Tailwind these show up as opacity modifiers: `border-tlw-warm-gray/15`
(subtle), `/25` (default), `/40` (strong). Card borders are almost always
`border-tlw-warm-gray/15`.

### 2.3 The one-accent rule (Signal Orange)

**`#E8650A` is reserved.** It marks the single most important action or the one
status that must not be missed — a primary CTA on a focused flow (e.g. "Approve &
send"), a "By client →" drill-in link, or the non-dismissible no-recording
compliance flag. It is never used decoratively and never for more than one thing
in a view. When in doubt, use navy, not orange.

> **Two oranges caveat.** `#E8650A` is *Signal Orange* (the UI accent). The
> **email logo's "+" mark uses `#F5821F`** (warmer, lighter) — see §9. Don't
> swap them.

### 2.4 Buttons — color convention

Observed usage, in order of prevalence:

- **Primary action** → `bg-tlw-navy-rich` (most common) or `bg-tlw-navy-deep`,
  white text. `rounded-tlw-lg`, `px-4 py-2`, `text-[13px] font-medium`.
- **Accent / hero action** → `bg-tlw-signal-orange`, white text. One per view.
- **Secondary** → bordered ghost: `border border-tlw-warm-gray/30`,
  `text-tlw-espresso`, `hover:bg-tlw-canvas` (or `hover:border-tlw-warm-gray/50`).
- **Tertiary / inline** → text-only, `text-tlw-navy-deep hover:underline` or
  muted `text-tlw-warm-gray hover:text-tlw-espresso`.
- **Destructive** → `text-red-600 hover:text-red-700`, or a red-tinted bordered
  button for standalone destructive actions.
- **Disabled** → `disabled:opacity-50`.

### 2.5 Status chips

The invoice status vocabulary is the canonical chip pattern — a rounded-full pill,
`text-[11px]`/`[12px] font-medium`, tinted background + saturated text:

| Status | Classes |
|--------|---------|
| Neutral / draft | `bg-tlw-canvas text-tlw-warm-gray` |
| Info / approved | `bg-blue-50 text-blue-700` |
| Pending / sent | `bg-amber-50 text-amber-700` |
| Success / paid | `bg-green-50 text-green-700` (or `bg-emerald-50 text-emerald-700`) |
| Danger / overdue | `bg-red-50 text-red-700` |
| Failed | `bg-red-100 text-red-800` |
| Void | `bg-tlw-canvas text-tlw-warm-gray line-through` |

A status color always ships **with a label** (icon + text), never color alone.

---

## 3. Scorecard semantic colors (Session Report surface)

The Session Report has its own semantic layer where **color carries meaning only**
(status + scoring band). Defined in `app/globals.css`; full rationale in
`spec/…_Session_Report_Spec_v0.4.md` §4 & §13.

```
--color-danger:  #B4451F   /* threshold breach, falling score, red flags */
--color-warning: #B07A1E   /* at threshold, amber execution, developing band */
--color-success: #3F7250   /* threshold met/exceeded, strong / masterful */
--color-info:    #3A567E   /* proficient band, neutral informational accent */
--color-muted:   #8B8680   /* baseline states, "no data yet" */
--color-surface: #F6F5F3   /* metric-card fill (muted, no border) */
--color-divider: rgba(139,134,128,0.25)   /* 0.5px section borders */
```

These are muted, document-like tones — deliberately *not* the brighter web
`red-50/green-50` chips used elsewhere in the app. Metric cards use the muted
surface fill with **no border** and a medium radius; sections are separated by a
0.5px top border and generous vertical padding.

---

## 4. Typography

### 4.1 Typefaces

Loaded in `app/layout.tsx` via Google Fonts; declared in `tailwind.config.js`.

- **Sans (default): `DM Sans`** — `font-sans`, stack
  `'DM Sans', -apple-system, system-ui, sans-serif`. Weights 300/400/500/600/700.
  This is the workhorse for all UI.
- **Serif (accent): `Cormorant Garamond`** — `font-serif`, stack
  `'Cormorant Garamond', Georgia, serif`. Weights 300/400/600 + italics. Used for
  elegant document contexts (e.g. the coaching-agreement renderer preview).

### 4.2 The eyebrow / label pattern

The one place uppercase is allowed. Used for card titles, section kickers, and the
`PageHeader` breadcrumb:

```
text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray
```

### 4.3 Type scale (observed)

| Role | Classes |
|------|---------|
| Page title (`PageHeader`) | `text-2xl font-medium leading-tight text-tlw-navy-deep` |
| Hero figure (card number) | `text-[30px] font-medium leading-none text-tlw-navy-deep` |
| Section / card heading | `text-[15px] font-semibold text-tlw-navy-deep` |
| Eyebrow / card title | `text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray` |
| Body | `text-[13px] text-tlw-espresso` |
| Secondary / caption | `text-[12px] text-tlw-warm-gray` |
| Fine print / meta | `text-[11px] text-tlw-warm-gray` |

Editor prose (TipTap) uses the `.tlw-prose` scope in `globals.css`: H2 1.25rem/600
navy, H3 1.05rem/600 espresso, plus a Harvard-outline list style
(`ol.tlw-outline` → I. / A. / 1. / a. / i. by depth).

### 4.4 Rules

- Sentence case in all prose and labels (uppercase only for the eyebrow pattern).
- Two weights carry the UI (regular 400, medium 500); 600/700 for headings and
  figures only.
- `tabular-nums` only where digits must align in columns (table rows, axis ticks,
  percentages) — not for hero figures.

---

## 5. Spacing, radii & elevation

### 5.1 Radii (`tailwind.config.js`)

| Token | Value | Utility | Typical use |
|-------|-------|---------|-------------|
| sm | 4px | `rounded-tlw-sm` | inner toggles, tiny chips |
| md | 6px | `rounded-tlw-md` | inputs, small buttons, toggle groups |
| lg | 8px | `rounded-tlw-lg` | buttons, list rows |
| xl | 10px | `rounded-tlw-xl` | — |
| 2xl | 12px | `rounded-tlw-2xl` | **cards, modals, panels** |

Pills use `rounded-full`.

### 5.2 Spacing rhythm

- Page header bottom margin: `mb-8`.
- Card padding: `p-4` (dashboard cards) to `px-5 py-4` (content sections).
- Inter-card / section gap: `gap-3` to `space-y-6`.
- Control gaps: `gap-2` (button rows), `gap-1.5` (tight clusters).

### 5.3 Elevation

Flat by default. Cards are **border, not shadow**:
`border border-tlw-warm-gray/15 bg-tlw-surface`. Shadow (`shadow-xl`) appears only
on overlays (modals).

---

## 6. Motion

From `tailwind.config.js`. Keep motion quick and functional.

- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — `ease-tlw` / `--tlw-ease`.
- **Durations:** fast `150ms` (`duration-tlw-fast`), base `200ms`, slow `300ms`.
- Default interactive feedback is `transition-colors` at 150ms. Loading states
  use `animate-pulse` on a `bg-tlw-canvas/70` skeleton block.

---

## 7. Component patterns

Reusable structures already established in the codebase — match these rather than
introducing new shapes.

### 7.1 Page header — `app/components/layout/PageHeader.tsx`

`eyebrow`/`breadcrumb` (uppercase-tracked) → `title` (2xl medium navy) →
optional `subtitle` (muted) on the left; `actions` cluster right-aligned. Always
`mb-8`.

### 7.2 Card — dashboard `CardFrame` & content sections

```
section.rounded-tlw-2xl.border.border-tlw-warm-gray/15.bg-tlw-surface.p-4
  header: eyebrow title (left) · controls (right)
  body:   flex-1
```

Content-page sections use the same skin at `px-5 py-4` with a
`text-[13px] font-semibold text-tlw-navy-deep` heading. Dashboard cards support
three sizes — **compact (S) / standard (M) / expanded (L)** — with progressive
disclosure; the size toggle and remove control live in `CardFrame`.

### 7.3 Modal / dialog

```
overlay:  fixed inset-0 z-50 flex items-center justify-center
          bg-tlw-navy-deep/40 (preferred) or bg-black/40 · p-4 · onClick=close
panel:    w-full max-w-{sm|lg|xl} rounded-tlw-2xl bg-tlw-surface shadow-xl
          — stopPropagation on the panel
header:   border-b border-tlw-warm-gray/15 px-5/6 py-4 — title + ✕ close
body:     px-5/6 py-5 (scroll with max-h-[80–85vh] overflow-y-auto)
footer:   border-t border-tlw-warm-gray/10 — right-aligned actions
```

Sticky-rail contexts portal modals/popovers to `document.body` to escape the
rail's stacking context.

### 7.4 Inputs

```
rounded-tlw-md border border-tlw-warm-gray/25 bg-tlw-canvas px-3 py-1.5
text-[13px] text-tlw-espresso outline-none focus:border-tlw-signal-orange
```

Labels above the field: `text-[11px]`/`[12px] text-tlw-warm-gray`, often the
uppercase-tracked variant in modals. Some surfaces use
`focus:ring-1 focus:ring-tlw-navy-deep/30` instead of the orange border — both are
acceptable; prefer the orange focus on primary forms.

### 7.5 Segmented toggle

Rounded container `border border-tlw-warm-gray/20 bg-tlw-canvas p-1`; the active
segment is `bg-white text-tlw-navy-deep shadow-sm` (or `bg-tlw-navy-rich text-white`
for the dashboard size toggle), inactive is
`text-tlw-warm-gray hover:text-tlw-espresso`.

---

## 8. Data visualization

Charts follow the bundled **dataviz** method (form → color-by-job → validate →
marks → interaction → a11y). Full palette + validator live in that skill.

- **Categorical palette** (validated for CVD on the white surface; keep slot
  order — it's the safety mechanism):
  `#2a78d6 · #1baf7a · #eda100 · #008300 · #4a3aa7 · #e34948 · #e87ba4 · #eb6834`.
  Beyond 8 series, fold the rest into a single **`#8B8680` "Other"** slice/series —
  never a 9th generated hue.
- **Brand marks in simple charts** use `tlw-navy-rich` (primary) over
  `tlw-warm-gray` (secondary/projected) — see the revenue mini-bars and monthly
  trend.
- Reference implementation: `components/dashboard/RevenueBreakdownModal.tsx`
  (donut with 2px surface gaps between slices, center total, hover highlight, and
  a legend that doubles as the table view).
- One axis, never dual-axis. Legend present for ≥2 series; a colored mark always
  pairs with a text label so identity is never color-alone.

---

## 9. Brand mark / logo

The wordmark is **"THE LEADERSHIP WELL"** in bold sans (Liberation Sans / Arial /
Helvetica), navy-black `#111226`, inside a thin outlined rectangle. The signature
detail: the **top-right corner is voided** and a thin **orange "+" (`#F5821F`)**
sits in the gap — its top edge meets the top border line, its right edge meets the
right border line, visually completing the corner.

- **Email logo is a raster PNG** (`public/logo-email.png`) because mail clients
  strip SVG. It's generated to spec by `scripts/generate-email-logo.py`
  (`pip install Pillow`); tune the plus weight/size/notch via the CONFIG dials at
  the top of that file. Keep colors/text in sync with `lib/signature.ts`.
- **Accent in the mark is `#F5821F`**, *not* Signal Orange `#E8650A` (§2.3).
- If the official designer asset is supplied, drop it in at the same path — no
  code change needed.

---

## 10. Email design constraints

Emails must survive Gmail / Outlook / Apple Mail:

- **Table layout + inline styles only.** No external CSS, no flexbox/grid.
- **Raster logo only** (hosted PNG) — never SVG.
- Signature is appended **server-side** from `email_signatures`
  (`lib/signature.ts`) — never trust the client to include it.
- The email frame in use: navy `#111226` header bar with the wordmark, warm
  `#f9f7f4` page background, white `#ffffff` content card, Georgia/serif body,
  `#3d2b1f` body ink, and a navy CTA button (`background:#111226; color:#fff;
  padding:12px 24px; border-radius:6px`). Tracked action/receipt links are plain
  URLs styled as buttons.

---

## 11. Accessibility & content

- **Identity is never color-alone.** Status = icon + label; chart series = legend
  + direct labels.
- **Contrast:** body/label ink (`espresso`/`warm-gray`) on white/canvas meets AA;
  where a chart hue dips below 3:1 on white, the legend labels provide the relief.
- **Focus states** are visible (orange border on inputs; `outline` on
  contenteditable).
- **Hit targets** exceed the visible mark on interactive chart elements.
- **Voice:** warm, plain, executive. Sentence case. Prefer scannable
  bullets/lists over prose in client-facing output.

---

## 12. Quick reference

```
Ink:        navy-deep #111226 · espresso #403832 · warm-gray #8B8680
Action:     navy-rich #0C1940 (primary) · Signal Orange #E8650A (one accent)
Surface:    white #FFFFFF on canvas #F2F2F0 · borders warm-gray @ 15/25/40%
Type:       DM Sans (UI) · Cormorant Garamond (document accent)
Eyebrow:    text-[11px] font-medium uppercase tracking-[2px] text-tlw-warm-gray
Figure:     text-[30px] font-medium text-tlw-navy-deep
Card:       rounded-tlw-2xl border border-tlw-warm-gray/15 bg-tlw-surface p-4
Radius:     cards/modals 12px · buttons 8px · inputs 6px · pills full
Motion:     150ms transition-colors, cubic-bezier(0.4,0,0.2,1)
Logo "+":   #F5821F  (NOT Signal Orange)
```
