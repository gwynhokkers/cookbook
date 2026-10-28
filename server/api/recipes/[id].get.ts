import { db } from '../../db'
import { findRecipe } from '../../domain/recipes/getRecipe'
import { getViewer } from '../../utils/viewer'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recipe ID is required'
    })
  }

  const recipe = await findRecipe(db, id, await getViewer(event))

  if (!recipe) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Recipe not found'
    })
  }

  return recipe
})
