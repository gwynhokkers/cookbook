import { rebuildRecipeSearchIndex } from '../../utils/recipeSearchIndex'

export default defineEventHandler(async (event) => {
  const authHeader = event.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET || 'migration-secret'}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  return rebuildRecipeSearchIndex()
})
