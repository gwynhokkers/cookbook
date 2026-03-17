import { createRecipe } from '~~/shared/utils/abilities'
import { extractRecipeFromImage } from '../../utils/recipeExtractor'

interface ExtractRequestBody {
  imageBase64?: string
  imageMimeType?: string
}

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  await requireUserSession(event)

  let imageBase64: string | undefined
  let imageMimeType: string | undefined
  const contentType = getHeader(event, 'content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    const imagePart = formData?.find(part => part.name === 'image')
    imageMimeType = imagePart?.type

    if (imagePart?.data && imagePart.data.length > 8 * 1024 * 1024) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Image is too large. Please upload an image under 8MB.'
      })
    }

    if (imageMimeType && ['image/heic', 'image/heif'].includes(imageMimeType.toLowerCase())) {
      throw createError({
        statusCode: 415,
        statusMessage: 'HEIC/HEIF images are not supported yet. Please switch camera format to JPEG (Most Compatible) or export as JPG/PNG.'
      })
    }

    if (imagePart?.data && imagePart.data.length > 0) {
      imageBase64 = imagePart.data.toString('base64')
    }
  } else {
    const body = await readBody<ExtractRequestBody>(event)
    if (typeof body?.imageBase64 === 'string') {
      imageBase64 = body.imageBase64
    }
    if (typeof body?.imageMimeType === 'string') {
      imageMimeType = body.imageMimeType
    }
  }

  if (!imageBase64) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image file is required'
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

  return await extractRecipeFromImage(normalizedBase64, event, imageMimeType)
})
