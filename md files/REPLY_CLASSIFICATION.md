# Reply Classification with Gemini — Addon to the Build Plan

Adds a second classification pass to Phase 5, on top of the existing bounce / auto-reply
/ real heuristic: once a reply is confirmed genuine, an LLM call sorts it into
**interested**, **not_interested**, **out_of_office**, **wrong_person**, or **undefined**. This document
is self-contained — schema, exact API calls, and code — and assumes the main plan
(`outreach-dashboard-plan.md`) as context.

## 1. Where this sits in the pipeline

The existing heuristic (bounce signals, then auto-reply signals, then "real") still runs
first, unchanged. It's fast, free, and catches the clear-cut cases via headers Google and
other providers set reliably. The LLM only ever sees messages that already passed that
filter as "real" — it's a refinement of an ambiguous bucket, not a replacement for the
cheap deterministic checks.

One deliberate behavior: auto-replies (whether identified by heuristic headers or classified as `out_of_office` by Gemini) respect the campaign's `stop_on_auto_reply` setting (which **defaults to TRUE: stop the sequence**).
- When `stop_on_auto_reply = true` (default): an auto-responder / out-of-office message stops the sequence for that lead (marks replied, clears `next_send_at`) and logs the reply.
- When `stop_on_auto_reply = false`: the sequence continues untouched, logging the auto-reply for reporting without stopping upcoming follow-ups.

`interested`, `not_interested`, `wrong_person`, and `undefined` all behave like a normal real reply: stop the sequence, log it, notify Telegram.

If every model/key combination fails (rate-limited, network error, bad response), the
reply still gets treated as a plain real reply — sequence stops, Telegram still fires,
just without the finer category. **The LLM step is an enrichment, never a dependency for
the core auto-stop mechanism.**

## 2. Which Gemini API surface, and why

Google now has two REST surfaces: the classic `generateContent` endpoint you linked
(labeled "Legacy" in the docs but still fully documented and supported), and a newer
"Interactions API" that Google's docs currently promote everywhere ("We recommend using
this API for access to all the latest features and models"). The Interactions API is
built for multi-step, tool-using, streaming interactions; this is one classification call
per reply with no tools and no multi-turn state. `generateContent` does everything needed
here — including the structured-output `responseSchema` mechanism this plan relies on for
reliable classification — with a simpler request shape. That's what the code below uses.
Worth knowing this choice exists in case the Interactions API becomes the only option down
the line, but nothing here suggests `generateContent` is going away soon.

## 3. The rate-limit reality (read this before adding keys)

Two things confirmed directly against current docs, both load-bearing for the "multiple
keys as fallback" design:

- **"Rate limits are applied per project, not per API key."** Every Gemini API key
  belongs to a Google Cloud project, and quota is pooled at the project level. Generating
  three keys under one project gives you one quota pool with three doors into it — not
  three times the capacity. For multiple keys to actually provide fallback capacity, each
  one needs to come from a **separate** Google Cloud project. In AI Studio, that means
  importing or creating additional projects (up to 10 at a time) before generating each
  key, not just clicking "create key" repeatedly on the same project.
- **Limits are tracked separately per model within a project.** This is genuinely useful:
  falling back to a different model on the *same* key is a real, independent quota pool,
  unlike falling back to a different key on the same project. That's why the code below
  has two fallback axes (model, then key) rather than just one.

One more current, time-sensitive note: Google is retiring "Standard" API keys in favor of
"Authorization" keys, and **Standard keys stop working entirely in September 2026** — a
few weeks from today. Every new key created in AI Studio is automatically issued as the
safer Authorization type already, so this only matters if an old key is ever reused; any
key generated now is unaffected.

Exact RPM/TPM/RPD numbers are no longer published as a static table — Google shows them
per-project inside AI Studio now (`aistudio.google.com/rate-limit`, once signed in). Don't
hardcode assumed numbers; the code below detects a 429 and moves on rather than trying to
count against a guessed ceiling.

## 4. Model fallback order

All eight models mentioned are current and real (cross-checked against
`ai.google.dev/gemini-api/docs/models`, updated as recently as yesterday relative to this
plan). One correction: "Gemini 3 Flash" is specifically the **Preview** variant
(`gemini-3-flash-preview`) — Google's docs note preview models "come with more restrictive
rate limits" than Stable ones, so it's left out of the default chain below and only worth
adding back as an extra last-resort rung.

Exact API endpoint strings, ordered Lite-first for daily-quota headroom:

| Model                  | Endpoint string          | Status              |
| ----------------------- | ------------------------ | -------------------- |
| Gemini 2.5 Flash-Lite    | `gemini-2.5-flash-lite`   | Stable               |
| Gemini 3.1 Flash-Lite    | `gemini-3.1-flash-lite`   | Stable               |
| Gemini 3.5 Flash-Lite    | `gemini-3.5-flash-lite`   | Stable               |
| Gemini 2.5 Flash         | `gemini-2.5-flash`        | Stable               |
| Gemini 3.5 Flash         | `gemini-3.5-flash`        | Stable               |
| Gemini 3.6 Flash         | `gemini-3.6-flash`        | Stable               |
| Gemini 3.7 Flash         | `gemini-3.7-flash`        | Stable, newest       |
| Gemini 3 Flash           | `gemini-3-flash-preview`  | Preview — tighter limits, optional extra fallback |

## 5. Schema addition

Validated against Postgres, including a deliberately invalid category to confirm the
constraint actually rejects it, not just parses.

```sql
-- One row per Gemini API key. Label should note which Google Cloud project it's
-- from -- that's what actually determines whether it provides independent quota.
create table gemini_api_keys (
  id uuid primary key default gen_random_uuid(),
  label text,
  api_key text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table gemini_api_keys is
  'Each key should come from a SEPARATE Google Cloud project -- Gemini rate limits are enforced per-project, not per-key, so multiple keys on the same project provide zero extra quota.';

-- Add to the replies table from the main schema (§7 of the main plan):
alter table replies add column llm_category text
  check (llm_category in ('interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined'));
```

## 6. Prompt and structured-output schema

`generateContent` supports constraining output to a JSON Schema via
`generationConfig.responseSchema` — this is what makes the result a guaranteed one of the
five categories rather than free text you'd need to fuzzy-match:

```json
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "enum": ["interested", "not_interested", "out_of_office", "wrong_person", "undefined"]
    }
  },
  "required": ["category"]
}
```

System instruction sent with every call:

```
You are classifying replies to cold outreach emails. Read the reply and
classify it into exactly one category:
- interested: the person shows genuine interest in continuing the conversation or learning more.
- not_interested: the person explicitly declines or shows no interest.
- out_of_office: this is an automated out-of-office or vacation auto-response, not a personal reply.
- wrong_person: the person says they are not the right contact, no longer work there, or redirects to someone else.
- undefined: the reply cannot be clearly determined or does not fit into any of the above categories.
Respond with only the category.
```

The reply's full plain-text body is what gets classified — not the short `snippet`
already stored for Telegram notifications. A truncated snippet can cut off exactly the
context ("...but forward this to Jane instead") that distinguishes `wrong_person` from
`not_interested`.

Raw REST shape, one (model, key) attempt:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "system_instruction": {
      "parts": [{"text": "You are classifying replies to cold outreach emails. ..."}]
    },
    "contents": [
      {"role": "user", "parts": [{"text": "Reply:\nThanks for reaching out, but we already have a vendor for this."}]}
    ],
    "generationConfig": {
      "responseFormat": {
        "text": {
          "mimeType": "application/json",
          "schema": {
            "type": "object",
            "properties": {
              "category": {
                "type": "string",
                "enum": ["interested", "not_interested", "out_of_office", "wrong_person", "undefined"]
              }
            },
            "required": ["category"]
          }
        }
      }
    }
  }'
```

Response shape (category lives inside `candidates[0].content.parts[0].text`, itself a
JSON string that needs a second parse):

```json
{
  "candidates": [
    {
      "content": {
        "parts": [{ "text": "{\"category\": \"not_interested\"}" }],
        "role": "model"
      },
      "finishReason": "STOP"
    }
  ]
}
```

## 7. Classification code

Syntax-checked with esbuild, not live-tested against the real API (no key available in
this environment) — verify it end to end during Phase 5 before trusting it on live leads.

```typescript
// supabase/functions/_shared/gemini.ts
//
// Classifies a genuine ("real") reply into a finer-grained category using Gemini,
// with fallback across both models and keys.
//
// Two independent fallback axes, because Gemini's rate limits work this way:
//   - Limits are enforced per Google Cloud PROJECT, not per key. Multiple keys only
//     provide real fallback capacity if each one comes from a separate project.
//   - Limits are tracked separately per MODEL within a project, so trying a
//     different model on the same key is a genuinely separate quota pool.
// A 429 on one (model, key) combination just means: move to the next one.

const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["interested", "not_interested", "out_of_office", "wrong_person", "undefined"],
    },
  },
  required: ["category"],
};

const SYSTEM_INSTRUCTION =
  "You are classifying replies to cold outreach emails. Read the reply and " +
  "classify it into exactly one category:\n" +
  "- interested: the person shows genuine interest in continuing the conversation or learning more.\n" +
  "- not_interested: the person explicitly declines or shows no interest.\n" +
  "- out_of_office: this is an automated out-of-office or vacation auto-response, not a personal reply.\n" +
  "- wrong_person: the person says they are not the right contact, no longer work there, or redirects to someone else.\n" +
  "- undefined: the reply cannot be clearly determined or does not fit into any of the above categories.\n" +
  "Respond with only the category.";

// Ordered by free-tier daily-quota generosity (Lite variants first), richest
// models as a last resort. Confirmed against https://ai.google.dev/gemini-api/docs/models
// as of Aug 2026 -- re-check that page if this list ever needs revisiting.
const MODEL_FALLBACK_ORDER = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  // gemini-3-flash-preview deliberately left out of the default chain: it's a
  // Preview model, which Google documents as carrying tighter rate limits than
  // the Stable ones above. Add it back in as an extra last-resort rung if wanted.
];

export type ReplyCategory = "interested" | "not_interested" | "out_of_office" | "wrong_person" | "undefined";

interface GeminiKey {
  id: string;
  api_key: string;
}

export async function classifyReplyWithGemini(
  replyText: string,
  context: { leadCompany?: string | null },
  keys: GeminiKey[],
): Promise<ReplyCategory | null> {
  if (keys.length === 0) return null;

  const userText = context.leadCompany
    ? `Company: ${context.leadCompany}\n\nReply:\n${replyText}`
    : `Reply:\n${replyText}`;

  for (const model of MODEL_FALLBACK_ORDER) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": key.api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
              contents: [{ role: "user", parts: [{ text: userText }] }],
              generationConfig: {
                responseFormat: {
                  text: {
                    mimeType: "application/json",
                    schema: CLASSIFICATION_SCHEMA,
                  },
                },
              },
            }),
          },
        );

        if (res.status === 429) {
          continue; // this (model, key) is out of quota right now -- try the next one
        }
        if (!res.ok) {
          console.error(`Gemini ${model} failed (key ${key.id}): ${res.status} ${await res.text()}`);
          continue;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) continue;

        const parsed = JSON.parse(text) as { category?: string };
        if (
          parsed.category === "interested" ||
          parsed.category === "not_interested" ||
          parsed.category === "out_of_office" ||
          parsed.category === "wrong_person" ||
          parsed.category === "undefined"
        ) {
          return parsed.category;
        }
      } catch (err) {
        console.error(`Gemini call failed (model ${model}, key ${key.id}):`, err);
        // fall through to the next (model, key) combination
      }
    }
  }

  return null; // every combination failed -- caller falls back to treating this as a plain "real" reply
}
```

## 8. Updated reply-checker logic (supersedes the "On a real reply" paragraph in §10 of the main plan)

Everything up through classifying a message as bounce / auto / real is unchanged. From
there:

On **bounce**: unchanged — mark the `campaign_lead` bounced, mark the `lead` globally
bounced.

On **auto** (from the heuristic): log the reply with `classification = 'auto'`. If the campaign's `stop_on_auto_reply` is enabled (the default), mark the `campaign_lead` replied (clearing `next_send_at`) to halt the sequence. If disabled, leave the sequence untouched.

On **real** (from the heuristic): fetch every active row from `gemini_api_keys`, and call
`classifyReplyWithGemini` with the reply's full plain-text body and the lead's company
name (from `variables`) for context.

- If it returns `out_of_office`: treat this like the heuristic's `auto` case — log the reply with `classification = 'auto'` and `llm_category = 'out_of_office'`. If `stop_on_auto_reply` is true (default), stop the sequence; if false, sequence continues untouched.
- If it returns `interested`, `not_interested`, `wrong_person`, or `undefined`: log the reply with
  `classification = 'real'` and `llm_category` set accordingly; mark the `campaign_lead`
  replied (clearing `next_send_at`); also check the original unsubscribe-keyword scan
  from the main plan and set `do_not_contact` if it matches, same as before. Notify
  Telegram, including the category in the message (e.g. distinguishing an `interested`
  reply from the others is worth making visually obvious).
- If it returns `null` (every model/key combination failed): log the reply with
  `classification = 'real'` and `llm_category = null`; behave exactly as the main plan
  originally specified for a real reply — nothing is lost, just the finer label.

## 9. Dashboard: managing Gemini keys

Add to the Settings page (alongside Telegram recipients, per the main plan): a simple
list — label, masked key value, active toggle, add/remove. Suggest the label capture
which Google Cloud project the key belongs to (e.g. "Project A", "Project B"), precisely
because that's the detail that determines whether adding another key is actually useful
or just cosmetic.

## 10. Additions to the Phase 5 checklist in the main plan

- [ ] Build the Gemini keys settings UI (label, key, active toggle)
- [ ] Implement `classifyReplyWithGemini` (model × key fallback, per §7)
- [ ] Wire it into the reply-checker: only called for heuristic-`real` messages, per §8
- [ ] Implement the `out_of_office` override (log as `auto`, don't stop the sequence)
- [ ] Implement graceful fallback to plain `real` handling when every model/key attempt fails
- [ ] Confirm a genuinely interested test reply gets classified `interested` and produces a distinctly-formatted Telegram message

**Done when:** a test reply that's an out-of-office auto-responder your heuristic missed
gets caught by the LLM step instead, and the sequence correctly keeps going rather than
stopping.

## 11. Assumptions worth flagging

- Telegram notifies on all four sequence-stopping categories (interested,
  not_interested, wrong_person, undefined), just formatted differently — not suppressed for the
  less-actionable ones. Reasonable default, easy to change if it turns out to be noisy.
- The model fallback list is a hardcoded ordered array, not a dashboard-editable setting
  — only the keys are dashboard-managed, matching what was actually asked for. Say the
  word if per-model configuration from the UI matters too.
- Classification runs on the full message body, not the short `snippet` already stored
  for notifications — worth the slightly larger prompt for the added accuracy on
  borderline cases.