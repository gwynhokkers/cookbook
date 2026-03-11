import { createRecipe } from '~~/shared/utils/abilities'
import { extractRecipeFromImage } from '../../utils/recipeExtractor'

interface ExtractRequestBody {
  imageBase64?: string
}

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  await requireUserSession(event)

  const body = await readBody<ExtractRequestBody>(event)
  const imageBase64 = body?.imageBase64

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image data is required'
    })
  }

  const normalizedBase64 = imageBase64.includes(',')
    ? imageBase64.split(',').pop()
    : imageBase64

  if (!normalizedBase64) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image data'
    })
  }

  return await extractRecipeFromImage(normalizedBase64, event)
})
