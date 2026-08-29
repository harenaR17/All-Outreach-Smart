/**
 * Gemini LLM Reply Classification Engine (Deno / Supabase Edge Functions)
 */

export type ReplyCategory =
  | 'interested'
  | 'not_interested'
  | 'out_of_office'
  | 'wrong_person'
  | 'undefined'

export interface GeminiKeyItem {
  id: string
  api_key: string
  label?: string | null
}

const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined'],
    },
  },
  required: ['category'],
}

const SYSTEM_INSTRUCTION =
  'You are classifying replies to cold outreach emails. Read the reply and ' +
  'classify it into exactly one category:\n' +
  '- interested: the person shows genuine interest in continuing the conversation or learning more.\n' +
  '- not_interested: the person explicitly declines or shows no interest.\n' +
  '- out_of_office: this is an automated out-of-office or vacation auto-response, not a personal reply.\n' +
  '- wrong_person: the person says they are not the right contact, no longer work there, or redirects to someone else.\n' +
  '- undefined: the reply cannot be clearly determined or does not fit into any of the above categories.\n' +
  'Respond with only the category.'

const MODEL_FALLBACK_ORDER = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
]

export async function classifyReplyWithGemini(
  replyText: string,
  context: { leadCompany?: string | null } = {},
  keys: GeminiKeyItem[] = []
): Promise<{ category: ReplyCategory | null; modelUsed?: string; keyIdUsed?: string }> {
  if (keys.length === 0) return { category: null }

  const userText = context.leadCompany
    ? `Company: ${context.leadCompany}\n\nReply:\n${replyText}`
    : `Reply:\n${replyText}`

  for (const model of MODEL_FALLBACK_ORDER) {
    for (const key of keys) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': key.api_key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
              contents: [{ role: 'user', parts: [{ text: userText }] }],
              generationConfig: {
                responseFormat: {
                  text: {
                    mimeType: 'application/json',
                    schema: CLASSIFICATION_SCHEMA,
                  },
                },
              },
            }),
          }
        )

        if (res.status === 429) continue

        if (!res.ok) {
          console.error(`Gemini ${model} failed (key ${key.id}): ${res.status} ${await res.text()}`)
          continue
        }

        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) continue

        const parsed = JSON.parse(text) as { category?: string }
        if (
          parsed.category === 'interested' ||
          parsed.category === 'not_interested' ||
          parsed.category === 'out_of_office' ||
          parsed.category === 'wrong_person' ||
          parsed.category === 'undefined'
        ) {
          return {
            category: parsed.category as ReplyCategory,
            modelUsed: model,
            keyIdUsed: key.id,
          }
        }
      } catch (err) {
        console.error(`Gemini call error (${model}, key ${key.id}):`, err)
      }
    }
  }

  return { category: null }
}
