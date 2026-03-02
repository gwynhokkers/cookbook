import { db, schema } from '../../../db'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { editRecipe } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, editRecipe)
  const recipeId = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!recipeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const { ingredientId, amount, unit, notes, order } = body

  if (!ingredientId || !amount || !unit) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ingredientId, amount, and unit are required'
    })
  }

  // Verify recipe exists and user owns it
  const recipe = await db.select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)

  if (!recipe || recipe.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  // Verify ingredient exists
  const ingredient = await db.select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, ingredientId))
    .limit(1)

  if (!ingredient || ingredient.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ingredient not found'
    })
  }

  const recipeIngredientId = nanoid()
  const orderValue = order || '0'

  await db.insert(schema.recipeIngredients).values({
    id: recipeIngredientId,
    recipeId,
    ingredientId,
    amount: String(amount),
    unit,
    notes: notes || null,
    order: String(orderValue),
    createdAt: new Date(),
    updatedAt: new Date()
  })

  const newRecipeIngredient = await db
    .select({
      id: schema.recipeIngredients.id,
      recipeId: schema.recipeIngredients.recipeId,
      ingredientId: schema.recipeIngredients.ingredientId,
      amount: schema.recipeIngredients.amount,
      unit: schema.recipeIngredients.unit,
      notes: schema.recipeIngredients.notes,
      order: schema.recipeIngredients.order,
      ingredient: {
        id: schema.ingredients.id,
        name: schema.ingredients.name,
        spoonacularIngredientId: schema.ingredients.spoonacularIngredientId,
        spoonacularData: schema.ingredients.spoonacularData
      }
    })
    .from(schema.recipeIngredients)
    .leftJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
    .where(eq(schema.recipeIngredients.id, recipeIngredientId))
    .limit(1)

  return newRecipeIngredient[0]
})
