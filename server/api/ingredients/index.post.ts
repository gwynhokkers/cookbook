import { db, schema } from '../../db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { name, spoonacularIngredientId, spoonacularData } = body

  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Ingredient name is required'
    })
  }

  // Check if ingredient already exists
  const existing = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.name, name))
    .limit(1)

  if (existing && existing.length > 0) {
    // Update existing ingredient with Spoonacular data if provided
    if (spoonacularIngredientId !== undefined || spoonacularData !== undefined) {
      const updateData: any = {
        updatedAt: new Date()
      }
      if (spoonacularIngredientId !== undefined) updateData.spoonacularIngredientId = spoonacularIngredientId ? String(spoonacularIngredientId) : null
      if (spoonacularData !== undefined) updateData.spoonacularData = spoonacularData
      
      await db.update(schema.ingredients)
        .set(updateData)
        .where(eq(schema.ingredients.id, existing[0].id))
      
      const updated = await db.select()
        .from(schema.ingredients)
        .where(eq(schema.ingredients.id, existing[0].id))
        .limit(1)
      
      return updated[0]
    }
    return existing[0]
  }

  // Create new ingredient
  const ingredientId = nanoid()
  const now = new Date()

  await db.insert(schema.ingredients).values({
    id: ingredientId,
    name,
    spoonacularIngredientId: spoonacularIngredientId ? String(spoonacularIngredientId) : null,
    spoonacularData: spoonacularData || null,
    createdAt: now,
    updatedAt: now
  })

  const newIngredient = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, ingredientId))
    .limit(1)

  return newIngredient[0]
})
