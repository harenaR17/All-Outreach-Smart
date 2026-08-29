/**
 * Gemini LLM Reply Classification Engine
 *
 * Classifies genuine inbound replies into 5 categories:
 * - interested: genuine interest in continuing the conversation or learning more
 * - not_interested: explicitly declines or shows no interest
 * - out_of_office: vacation / automated out-of-office response
 * - wrong_person: not the right contact / no longer works there / redirects
 * - undefined: reply cannot be clearly determined or does not fit any of the above
 *
 * Implements two-axis fallback:
 * 1. Model fallback across 7 Gemini Flash models (Lite-first for daily quota efficiency)
 * 2. Key rotation across all active Google Cloud project keys
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

export const CLASSIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      enum: ['interested', 'not_interested', 'out_of_office', 'wrong_person', 'undefined'],
    },
  },
  required: ['category'],
}

export const SYSTEM_INSTRUCTION =
  'You are classifying replies to cold outreach emails. Read the reply and ' +
  'classify it into exactly one category:\n' +
  '- interested: the person shows genuine interest in continuing the conversation or learning more.\n' +
  '- not_interested: the person explicitly declines or shows no interest.\n' +
  '- out_of_office: this is an automated out-of-office or vacation auto-response, not a personal reply.\n' +
  '- wrong_person: the person says they are not the right contact, no longer work there, or redirects to someone else.\n' +
  '- undefined: the reply cannot be clearly determined or does not fit into any of the above categories.\n' +
  'Respond with only the category.'

export const MODEL_FALLBACK_ORDER = [
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
]

/**
 * Classifies reply text with Gemini using model and key fallback.
 */
export async function classifyReplyWithGemini(
  replyText: string,
  context: { leadCompany?: string | null } = {},
  keys: GeminiKeyItem[] = []
): Promise<{ category: ReplyCategory | null; modelUsed?: string; keyIdUsed?: string }> {
  if (keys.length === 0) {
    return { category: null }
  }

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
                responseMimeType: 'application/json',
                responseJsonSchema: CLASSIFICATION_SCHEMA,
              },
            }),
          }
        )

        if (res.status === 429) {
          // Rate limit exceeded on this project/model -- try next
          continue
        }

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
