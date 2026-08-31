export interface ExtractedRecipe {
  title?: string
  description?: string
  ingredients: Array<{
    amount: string
    unit: string
    ingredientName: string
    notes?: string
  }>
  steps: Array<{
    title: string
    content: string
  }>
  tags?: string[]
  source?: string
  imageUrl?: string
  servings?: number
  estimatedMinutes?: number
}

export interface TranscribedRecipeText {
  title?: string
  description?: string
  servings?: number
  ingredientsText?: string
  methodText?: string
  tags?: string[]
  source?: string
}

export type TranscriptRegion = 'title' | 'ingredients' | 'method' | 'full'

export interface ExtractionConfig {
  useTwoStage: boolean
  ocrModel: string
  structureModel: string
}

export const EXTRACTION_SEED = 424242
export const EXTRACTION_TEMPERATURE = 0.1
export const EXTRACTION_TOP_P = 0.1

export const RECIPE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    ingredients: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          amount: { type: 'string', maxLength: 100 },
          unit: { type: 'string', maxLength: 60 },
          ingredientName: { type: 'string', maxLength: 240 },
          notes: { type: 'string', maxLength: 400 }
        },
        required: ['amount', 'unit', 'ingredientName', 'notes']
      }
    },
    steps: {
      type: 'array',
      maxItems: 60,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', maxLength: 200 },
          content: { type: 'string', maxLength: 4000 }
        },
        required: ['title', 'content']
      }
    },
    tags: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', maxLength: 80 }
    },
    estimatedMinutes: { type: 'number' }
  },
  required: ['title', 'description', 'ingredients', 'steps', 'tags']
}

export const TRANSCRIPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    ingredientsText: { type: 'string', maxLength: 12000 },
    methodText: { type: 'string', maxLength: 18000 },
    tags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } }
  },
  required: ['title', 'description', 'ingredientsText', 'methodText', 'tags']
}

/** Narrow vision schemas for tri-region extraction (one image per region). */
export const REGION_TITLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', maxLength: 240 },
    description: { type: 'string', maxLength: 5000 },
    servings: { type: 'number' },
    tags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } }
  },
  required: ['title', 'description', 'tags']
}

export const REGION_INGREDIENTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ingredientsText: { type: 'string', maxLength: 12000 }
  },
  required: ['ingredientsText']
}

export const REGION_METHOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    methodText: { type: 'string', maxLength: 18000 }
  },
  required: ['methodText']
}
