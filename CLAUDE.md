@AGENTS.md

# Delivery workflow

This repo uses a `dev` integration branch. **`main` is never touched except by the repo owner's explicit approval** — no agent pushes to or merges into `main` under any circumstance.

- Every change branches off the latest `dev` (`feat/<slug>` or `fix/<slug>`), gets implemented, and opens a PR back to `dev` (`gh pr create --base dev`).
- Every unit of work is tracked as a GitHub issue (`gh issue create`) before implementation starts.
- Cross-cutting features that touch both a server action/schema/edge-function layer and a UI layer are split into a backend issue and a frontend issue; the backend PR merges to `dev` first, then the frontend branch is cut from the updated `dev`.
- Multiple issues can be worked concurrently as long as they don't touch the same files — check this before starting parallel work.

## Subagents

- **`frontend-dev`** — owns `src/components/**` and UI-facing `src/app/**` (pages, layouts). Must read `STYLE.md` (or invoke the `ui-designer` skill) before UI work, and follow its patterns exactly rather than inventing new ones.
- **`backend-dev`** — owns `src/app/actions/**`, `src/lib/**`, `supabase/migrations/**`, `supabase/functions/**`, and API routes.
- **`auditor`** — given a PR and its originating issue, checks the change against the original request (correctness, scope, no drift), runs `npm run lint` / `npm run build`, and for frontend PRs invokes the `ui-designer` skill against `STYLE.md`. Reports **Pass / Warning / Fail** per criterion plus an overall verdict. Does not edit code.

## Style reference

See `STYLE.md` at the repo root for the extracted design system (colors, spacing, radii, component patterns). New UI should reuse its patterns rather than introducing new ones — the `ui-designer` skill audits against it.
