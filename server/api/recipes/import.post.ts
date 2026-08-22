import { db, schema } from '../../db'
import { nanoid } from 'nanoid'
import { and, eq } from 'drizzle-orm'
import { toRecipeTitleCase } from '~~/shared/utils/recipeTitle'

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

async function findOrCreateIngredient(name: string) {
  const existing = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.name, name))
    .limit(1)

  if (existing && existing.length > 0) {
    return existing[0]
  }

  const id = nanoid()
  const now = new Date()
  await db.insert(schema.ingredients).values({
    id,
    name,
    spoonacularIngredientId: null,
    spoonacularData: null,
    createdAt: now,
    updatedAt: now
  })

  const created = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, id))
    .limit(1)

  return created[0]
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

  const title = toRecipeTitleCase(titleRaw)
  const source = String(body?.source || '').trim() || 'Baan — Kay Plunkett-Hogge'
  const visibility = body?.visibility === 'public' ? 'public' : 'private'
  const tags = Array.isArray(body?.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : []
  const steps = Array.isArray(body?.steps)
    ? body.steps
      .map((step) => ({
        title: String(step?.title || '').trim() || 'Step',
        content: String(step?.content || '').trim()
      }))
      .filter((step) => step.content)
    : []

  const ingredientRows = Array.isArray(body?.ingredients) ? body.ingredients : []

  const duplicates = await db.select()
    .from(schema.recipes)
    .where(and(
      eq(schema.recipes.title, title),
      eq(schema.recipes.source, source)
    ))
    .limit(1)

  if (duplicates && duplicates.length > 0) {
    return {
      skipped: true,
      id: duplicates[0].id,
      title: duplicates[0].title,
      source: duplicates[0].source
    }
  }

  const recipeId = nanoid()
  const now = new Date()

  const newRecipe = {
    id: recipeId,
    title,
    description: body?.description ? String(body.description).trim() : null,
    imageUrl: null,
    date: now,
    tags,
    source,
    steps,
    visibility,
    authorId: null,
    createdAt: now,
    updatedAt: now
  }

  await db.insert(schema.recipes).values(newRecipe)

  const linked = []
  for (let i = 0; i < ingredientRows.length; i++) {
    const row = ingredientRows[i]
    const ingredientName = String(row?.ingredientName || '').trim()
    if (!ingredientName) continue

    const ingredient = await findOrCreateIngredient(ingredientName)
    const recipeIngredientId = nanoid()
    const amount = String(row?.amount ?? '').trim() || '1'
    const unit = String(row?.unit ?? '').trim() || 'pieces'

    await db.insert(schema.recipeIngredients).values({
      id: recipeIngredientId,
      recipeId,
      ingredientId: ingredient.id,
      amount,
      unit,
      notes: row?.notes ? String(row.notes).trim() : null,
      order: String(i),
      createdAt: now,
      updatedAt: now
    })

    linked.push({
      id: recipeIngredientId,
      ingredientId: ingredient.id,
      ingredientName,
      amount,
      unit
    })
  }

  return {
    skipped: false,
    id: recipeId,
    title,
    source,
    visibility,
    ingredientCount: linked.length,
    stepCount: steps.length
  }
})
