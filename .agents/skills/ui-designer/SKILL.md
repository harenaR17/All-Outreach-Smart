---
name: ui-designer
description: Audits UI changes against STYLE.md, or briefs the frontend-dev agent on style rules before it starts work. Use when reviewing a frontend PR for design consistency, or before implementing any new UI in the Outreach Smart dashboard.
---

This skill has two modes, depending on why it was invoked.

## Brief mode (before writing UI)

Used by `frontend-dev` before implementing a UI-touching issue.

1. Read `STYLE.md` at the repo root in full.
2. Identify which sections are relevant to the issue at hand (e.g. a new modal → read the Modal pattern + Field label + Text input patterns; a new list → read the icon-only action button + row hover patterns).
3. State back, briefly, the exact class strings/patterns to reuse for this specific task — don't just say "follow STYLE.md," quote the relevant snippet(s) so there's no ambiguity about which shade of zinc/indigo/radius to use.

## Audit mode (reviewing a PR/diff)

Used by `auditor` (or directly, on request) to check a frontend change for design-system compliance.

1. Read `STYLE.md` in full.
2. Read the diff (`git diff dev...<branch>` or the PR's changed files).
3. Check the diff against every applicable rule in `STYLE.md`:
   - Colors: only zinc (structure) + the six semantic hues (indigo/emerald/amber/rose/purple/blue), each used with the `bg-{color}-500/10 text-{color}-400` triad — no new hues, no solid fills.
   - Radius: only `rounded-full` / `rounded-lg` / `rounded-xl` / `rounded-2xl` — flag any bare `rounded` or `rounded-md`.
   - Typography: only the documented scale (`text-[11px]`, `text-xs`, `text-sm`, `text-base`) with the documented weight conventions.
   - Component structure: new modals match the exact modal skeleton; new buttons match the icon-button pattern; new badges match the status-badge or category-badge pattern; new stat displays match the inline-stat pattern.
   - Icons: `lucide-react` only, at one of the four documented sizes.
   - Motion: `transition-colors`/`transition-all` with no explicit duration, `animate-in fade-in duration-200` for modal entrances only — flag any new animation primitive.
4. Report findings as a short list: each deviation with the file/line, what STYLE.md says, and what the diff does instead. If nothing deviates, say so plainly — don't invent nitpicks. This feeds directly into the auditor's Pass/Warning/Fail verdict, so be concrete and specific rather than general ("looks fine" is not a finding).
