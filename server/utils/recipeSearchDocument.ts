import { parseRecipeSource } from '~~/shared/utils/formatRecipeSource'

export interface RecipeSearchDocument {
  recipeId: string
  title: string
  description: string
  tags: string
  source: string
  book: string
  author: string
  ingredients: string
  steps: string
  contributor: string
}

export type RecipeSearchAggregateInput = {
  recipeId: string
  title: string
  description?: string | null
  tags?: string[] | null
  source?: string | null
  steps?: Array<{ title?: string; content?: string }> | null
  ingredientNames: string[]
  contributor?: string
}

/** Build an FTS document from data already in hand (no DB reads). */
export function buildRecipeSearchDocumentFromAggregate(
  input: RecipeSearchAggregateInput
): RecipeSearchDocument {
  const parsedSource = parseRecipeSource(input.source)
  const steps = (input.steps || [])
    .map((step) => `${step.title || ''} ${step.content || ''}`.trim())
    .filter(Boolean)
    .join(' ')

  return {
    recipeId: input.recipeId,
    title: input.title,
    description: input.description || '',
    tags: (input.tags || []).join(' '),
    source: input.source || '',
    book: parsedSource?.book || '',
    author: parsedSource?.author || '',
    ingredients: input.ingredientNames.filter(Boolean).join(' '),
    steps,
    contributor: input.contributor || ''
  }
}
