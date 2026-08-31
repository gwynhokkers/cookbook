import type { H3Event } from 'h3'
import { generateText } from 'ai'
import { z } from 'zod'
import {
  SHOPPING_LIST_AISLES,
  type AmalgamatedIngredient,
  type ShoppingListAisle
} from '~~/shared/utils/shoppingListTypes'
import { getWorkersAi } from './workersAi'

export type EnrichedShoppingItem = AmalgamatedIngredient & {
  aisle: ShoppingListAisle | null
  packageSuggestion: string | null
  substitutionNote: string | null
}

const enrichmentSchema = z.object({
  items: z.array(z.object({
    ingredientId: z.string().nullable().optional(),
    name: z.string(),
    aisle: z.enum(SHOPPING_LIST_AISLES),
    packageSuggestion: z.string().nullable().optional(),
    substitutionNote: z.string().nullable().optional()
  }))
})

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response')
  }
  return JSON.parse(candidate.slice(start, end + 1))
}

function defaultEnrichment(items: AmalgamatedIngredient[]): EnrichedShoppingItem[] {
  return items.map(item => ({
    ...item,
    aisle: 'Other' as ShoppingListAisle,
    packageSuggestion: null,
    substitutionNote: null
  }))
}

function mergeEnrichment(
  amalgamated: AmalgamatedIngredient[],
  parsed: z.infer<typeof enrichmentSchema>
): EnrichedShoppingItem[] {
  const byKey = new Map<string, (typeof parsed.items)[number]>()
  for (const item of parsed.items) {
    if (item.ingredientId) {
      byKey.set(`id:${item.ingredientId}`, item)
    }
    byKey.set(`name:${item.name.trim().toLowerCase()}`, item)
  }

  return amalgamated.map((item) => {
    const match = (item.ingredientId && byKey.get(`id:${item.ingredientId}`))
      || byKey.get(`name:${item.name.trim().toLowerCase()}`)

    return {
      ...item,
      aisle: (match?.aisle as ShoppingListAisle | undefined) || 'Other',
      packageSuggestion: match?.packageSuggestion?.trim() || null,
      substitutionNote: match?.substitutionNote?.trim() || null
    }
  })
}

async function requestEnrichment(
  event: H3Event,
  amalgamated: AmalgamatedIngredient[]
): Promise<EnrichedShoppingItem[]> {
  const config = useRuntimeConfig(event)
  const model = getWorkersAi(event).languageModel(String(config.humphryModel))

  const payload = amalgamated.map(item => ({
    ingredientId: item.ingredientId,
    name: item.name,
    displayAmount: item.displayAmount,
    totalAmount: item.totalAmount,
    totalUnit: item.totalUnit,
    needsReview: item.needsReview,
    contributions: item.contributions
  }))

  const prompt = `You are Humphry helping build a grocery shopping list.

Given amalgamated ingredients with EXACT totals already computed, return ONLY JSON matching:
{
  "items": [
    {
      "ingredientId": "string|null",
      "name": "string",
      "aisle": one of ${JSON.stringify(SHOPPING_LIST_AISLES)},
      "packageSuggestion": "string|null",
      "substitutionNote": "string|null"
    }
  ]
}

Rules:
- Do NOT change totals or invent quantities.
- packageSuggestion should suggest typical shoppable packs (e.g. "2 × 750ml milk bottles") while the exact needed amount stays separate.
- substitutionNote only when useful (hard to find, overlap, sensible swap). Keep brief.
- Include an entry for every input ingredient.
- Prefer Australian supermarket aisle naming within the allowed aisle list.

Input ingredients:
${JSON.stringify(payload)}`

  const result = await generateText({
    model,
    prompt,
    maxOutputTokens: 4096
  })

  const json = extractJsonObject(result.text || '')
  const parsed = enrichmentSchema.parse(json)
  return mergeEnrichment(amalgamated, parsed)
}

export async function enrichShoppingListItems(
  event: H3Event,
  amalgamated: AmalgamatedIngredient[]
): Promise<{ items: EnrichedShoppingItem[], enriched: boolean, warning: string | null }> {
  if (!amalgamated.length) {
    return { items: [], enriched: true, warning: null }
  }

  try {
    const items = await requestEnrichment(event, amalgamated)
    return { items, enriched: true, warning: null }
  } catch (firstError) {
    try {
      const items = await requestEnrichment(event, amalgamated)
      return { items, enriched: true, warning: null }
    } catch (secondError) {
      const message = secondError instanceof Error
        ? secondError.message
        : firstError instanceof Error
          ? firstError.message
          : 'AI enrichment failed'

      return {
        items: defaultEnrichment(amalgamated),
        enriched: false,
        warning: `Humphry enrichment unavailable (${message}). Showing exact totals without package suggestions.`
      }
    }
  }
}
