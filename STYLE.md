# Outreach Smart — Style Guide

This is extracted from the existing codebase (`src/app/globals.css`, `CampaignCard.tsx`, `EditLeadModal.tsx`, `ActivityFeed.tsx`, and other established components) — not invented. When building new UI, copy these patterns rather than introducing new ones. The `ui-designer` skill audits changes against this file.

## Foundations

- **Framework:** Next.js App Router + Tailwind CSS v4 (`@import "tailwindcss"` in `globals.css`, no `tailwind.config.*` — theme tokens live in the `@theme inline` block).
- **Base palette:** `--background: #09090b` (near-black), `--foreground: #f4f4f5`. The whole app is dark-mode-only — there is no light theme to support.
- **Font:** Geist Sans / Geist Mono via `next/font`, fallback `Arial, Helvetica, sans-serif`. Use `font-mono` for emails, IDs, and JSON/code-like values.
- **Icons:** `lucide-react` exclusively. Sizes: `w-3 h-3` (micro, inline with 11px text), `w-3.5 h-3.5` (small, buttons/labels), `w-4 h-4` (standard), `w-5 h-5` (modal header icon).

## Color usage (semantic, not decorative)

| Color | Meaning | Example classes |
|---|---|---|
| **indigo-500** | Primary/brand accent — icons, focus rings, links, active states | `bg-indigo-500/10 border-indigo-500/20 text-indigo-400`, focus ring `focus:ring-indigo-500/40` |
| **emerald** | Success / active / positive | `bg-emerald-500/10 text-emerald-400` |
| **amber** | Warning / paused / needs-attention | `bg-amber-500/10 text-amber-400` |
| **rose** | Danger / delete / negative / required-field asterisk | `bg-rose-500/10 text-rose-400` |
| **purple** | Unclassified/unknown state | `bg-purple-500/10 text-purple-400` |
| **blue** | Informational / neutral-positive | `bg-blue-500/10 text-blue-400` |
| **zinc** | Structure — backgrounds, borders, body text at every other elevation | see below |

Never introduce a new brand hue. Every colored surface follows the same `bg-{color}-500/10 text-{color}-400` (+ optional `border-{color}-500/20`) triad — a tinted-glass chip, not a solid fill.

## Surfaces & elevation (zinc scale, dark → light)

- Page background: `#09090b` (via `body`).
- Modal backdrop: `bg-black/80 backdrop-blur-sm`.
- Modal panel / highest elevation: `bg-zinc-950 border border-zinc-800`.
- Cards (default): `bg-zinc-900/40 border border-zinc-800`, hover: `hover:bg-zinc-900/60 hover:border-zinc-700/80`.
- Inputs / recessed surfaces: `bg-zinc-900 border border-zinc-800`.
- Row hover (tables/lists): `hover:bg-zinc-900/30`.
- Body text: `text-zinc-100` (headings/values) → `text-zinc-300` (labels) → `text-zinc-400` (secondary/meta) → `text-zinc-500` (tertiary/muted, e.g. separators).

## Radius

- `rounded-full` — badges, status dots.
- `rounded-lg` — icon-only buttons, small icon containers.
- `rounded-xl` — inputs, medium icon containers (e.g. modal header icon box).
- `rounded-2xl` — cards, modal panels.

Never use a bare `rounded` or `rounded-md` — this codebase only uses the four sizes above.

## Typography scale

- `text-[11px]` — micro: stat labels, status badge text, meta rows on cards.
- `text-xs` (12px) — the workhorse size: form labels, body copy, table cells, buttons.
- `text-sm` — card titles, section headings.
- `text-base` — modal titles only.
- Weight: `font-medium` for emphasis inside small text, `font-semibold` for labels/headings, `font-bold` for modal titles.

## Component patterns (copy these verbatim)

**Status badge** (pill with dot):
```html
<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium {bg} {text}">
  <span class="w-1.5 h-1.5 rounded-full {dot}" />
  {label}
</span>
```

**Category/classification badge** (bordered chip, e.g. reply classification):
```html
<span class="px-2.5 py-1 rounded-full text-[11px] font-medium {bg} {text} border {border}">
  {emoji} {label}
</span>
```

**Icon-only action button:**
```html
<button class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer" title="...">
  <Icon class="w-3.5 h-3.5" />
</button>
```
Destructive variant: `hover:text-rose-400 hover:bg-rose-500/10`.

**Card action row** — reveal-on-hover:
```html
<div class="opacity-0 group-hover:opacity-100 transition-opacity">...</div>
```
(parent card needs `group` class.)

**Inline stat** (used on campaign cards, will reuse for KPI chips):
```html
<span class="flex items-center gap-1 text-[11px] text-zinc-400">
  <Icon class="w-3 h-3" />
  <span class="text-zinc-200 font-medium">{value}</span>
  <span>{label}</span>
</span>
```

**Text input:**
```html
<input class="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
```

**Field label:**
```html
<label class="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
  <Icon class="w-3.5 h-3.5 text-{context-color}-400" />
  Label text <span class="text-rose-400">*</span> <!-- if required -->
</label>
```

**Modal (backdrop + panel):**
```html
<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
  <div class="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
    <div class="p-6 border-b border-zinc-800 flex items-center justify-between"><!-- header --></div>
    <form class="p-6 overflow-y-auto space-y-5 flex-1"><!-- body --></form>
  </div>
</div>
```
Header icon box: `w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center`. Close button: same icon-button pattern as above, `<X class="w-4 h-4" />`.

**Small icon container** (list-row leading icon):
```html
<div class="w-8 h-8 rounded-lg {bg} border {border} {text} flex items-center justify-center">
  <Icon class="w-3.5 h-3.5" />
</div>
```

## Motion

- Default: `transition-colors` or `transition-all` on interactive elements, no explicit duration (Tailwind default).
- Modal entrance: `animate-in fade-in duration-200`.
- Nothing else animates — no page transitions, no skeleton shimmer today. Don't add new animation primitives without a reason.

## Conventions for new UI (KPI tiles, pagination, etc.)

- New KPI/stat tiles should reuse the **inline stat** or **status badge** patterns above, colored semantically (emerald for positive metrics, indigo for neutral counts, rose only for genuinely negative numbers like failures/bounces).
- A new **Pagination** component should match existing button styling (icon-only button pattern for prev/next arrows, `text-xs text-zinc-400` for page info text, `text-zinc-100`/indigo accent for the active page).
- Any new modal must follow the modal pattern above exactly — same backdrop, panel, header, and spacing — for visual consistency with `EditLeadModal`, `AddLeadModal`, `AssignCampaignModal`, etc.
