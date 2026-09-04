import { createPersistRecipe } from '../../utils/persistRecipe'

interface ImportIngredient {
  ingredientName?: string
  amount?: string | number
  unit?: string
  notes?: string | null
}

interface ImportBody {
  title?: string
  description?: string
  tags?: string[]
  source?: string
  visibility?: string
  servings?: number
  estimatedMinutes?: number | null
  steps?: Array<{ title?: string; content?: string }>
  ingredients?: ImportIngredient[]
}

function migrationSecret() {
  return process.env.MIGRATION_SECRET || 'migration-secret'
}

function assertAuthorized(event: { headers: Headers }) {
  const authHeader = event.headers.get('authorization')
  if (authHeader !== `Bearer ${migrationSecret()}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }
}

export default defineEventHandler(async (event) => {
  assertAuthorized(event)

  const body = await readBody<ImportBody>(event)
  const titleRaw = String(body?.title || '').trim()
  if (!titleRaw) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  const source = String(body?.source || '').trim()
  if (!source) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source is required (e.g. book title and author)'
    })
  }

  const result = await createPersistRecipe(
    {
      title: titleRaw,
      description: body?.description ? String(body.description).trim() : null,
      tags: Array.isArray(body?.tags) ? body.tags : [],
      source,
      servings: body?.servings ?? null,
      estimatedMinutes: body?.estimatedMinutes ?? null,
      steps: Array.isArray(body?.steps) ? body.steps : [],
      visibility: body?.visibility === 'public' ? 'public' : 'private',
      authorId: null,
      ingredients: Array.isArray(body?.ingredients) ? body.ingredients : []
    },
    {
      skipIfDuplicateSourceTitle: true,
      invalidateSearchCache: true
    }
  )

  if (result.skipped) {
    return {
      skipped: true,
      id: result.id,
      title: result.title,
      source: result.source
    }
  }

  return {
    skipped: false,
    id: result.id,
    title: result.title,
    source: result.source,
    visibility: result.visibility,
    ingredientCount: result.ingredientCount,
    stepCount: result.stepCount
  }
})
