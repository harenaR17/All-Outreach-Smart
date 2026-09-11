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
 * 1. Dynamic model discovery querying Google's v1beta/models endpoint (Lite-first for quota efficiency)
 * 2. Key rotation across all active Google Cloud project keys with 429 rate-limit failover
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
  'You are classifying replies to cold outreach emails. Read the reply (and the preceding email thread history for context if provided) and ' +
  'classify the latest reply into exactly one category:\n' +
  '- interested: the person shows genuine interest in continuing the conversation, learning more, asking questions, or scheduling a meeting.\n' +
  '- not_interested: the person explicitly declines or shows no interest.\n' +
  '- out_of_office: this is an automated out-of-office or vacation auto-response, not a personal reply.\n' +
  '- wrong_person: the person says they are not the right contact, no longer work there, or redirects to someone else.\n' +
  '- undefined: the reply cannot be clearly determined or does not fit into any of the above categories.\n' +
  'Respond with only the category.'

export const DEFAULT_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
]

// Backward compatibility alias
export const MODEL_FALLBACK_ORDER = DEFAULT_FALLBACK_MODELS

interface GoogleModelItem {
  name: string
  supportedGenerationMethods?: string[]
}

// In-memory cache for auto-discovered models (1 hour TTL)
let cachedModels: { models: string[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * Discovers available Gemini models dynamically from the Google API.
 * Prioritizes flash-lite / lite models first for daily quota efficiency,
 * followed by standard flash models.
 */
export async function getAvailableFlashModels(keys: GeminiKeyItem[] = []): Promise<string[]> {
  if (cachedModels && Date.now() - cachedModels.fetchedAt < CACHE_TTL_MS && cachedModels.models.length > 0) {
    return cachedModels.models
  }

  for (const key of keys) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key.api_key}`)
      if (res.status === 429) continue
      if (!res.ok) continue

      const data = (await res.json()) as { models?: GoogleModelItem[] }
      const modelsList = data.models || []

      const validModels = modelsList
        .filter((m) => {
          const name = m.name?.toLowerCase() || ''
          const methods = m.supportedGenerationMethods || []
          return (
            methods.includes('generateContent') &&
            name.includes('flash') &&
            !name.includes('embedding') &&
            !name.includes('imagen') &&
            !name.includes('vision') &&
            !name.includes('audio')
          )
        })
        .map((m) => m.name.replace(/^models\//, ''))

      if (validModels.length > 0) {
        const liteModels = validModels.filter((m) => m.toLowerCase().includes('lite')).sort().reverse()
        const regularFlashModels = validModels.filter((m) => !m.toLowerCase().includes('lite')).sort().reverse()

        const ordered = Array.from(new Set([...liteModels, ...regularFlashModels]))
        if (ordered.length > 0) {
          cachedModels = { models: ordered, fetchedAt: Date.now() }
          return ordered
        }
      }
    } catch {
      // Key error or network hiccup, try next key
    }
  }

  if (cachedModels?.models && cachedModels.models.length > 0) {
    return cachedModels.models
  }

  return DEFAULT_FALLBACK_MODELS
}

/**
 * Classifies reply text with Gemini using dynamic model discovery and key fallback.
 */
export async function classifyReplyWithGemini(
  replyText: string,
  context: { leadCompany?: string | null; threadHistory?: string | null } = {},
  keys: GeminiKeyItem[] = []
): Promise<{ category: ReplyCategory | null; modelUsed?: string; keyIdUsed?: string }> {
  if (keys.length === 0) {
    return { category: null }
  }

  let userText = ''
  if (context.threadHistory?.trim()) {
    userText = `Email Thread History (for context):\n${context.threadHistory.trim()}\n\n`
    if (context.leadCompany?.trim()) {
      userText += `Lead Company: ${context.leadCompany.trim()}\n\n`
    }
    userText += `Latest Incoming Reply (Classify this specific reply):\n${replyText}`
  } else {
    userText = context.leadCompany?.trim()
      ? `Company: ${context.leadCompany.trim()}\n\nReply:\n${replyText}`
      : `Reply:\n${replyText}`
  }

  const models = await getAvailableFlashModels(keys)

  for (const model of models) {
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
          // Rate limit exceeded on this project/model -- try next key or model
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
