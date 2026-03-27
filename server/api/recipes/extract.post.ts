import { createRecipe } from '~~/shared/utils/abilities'
import { extractRecipeFromImage, extractRecipeFromRegionImages } from '../../utils/recipeExtractor'

interface ExtractRequestBody {
  imageBase64?: string
  imageMimeType?: string
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function assertImagePart(name: string, data: Buffer | undefined, mime: string | undefined) {
  if (!data || data.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `Image part "${name}" is required and must not be empty`
    })
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Image "${name}" is too large. Each image must be under 8MB.`
    })
  }
  if (mime && ['image/heic', 'image/heif'].includes(mime.toLowerCase())) {
    throw createError({
      statusCode: 415,
      statusMessage: 'HEIC/HEIF images are not supported yet. Please switch camera format to JPEG (Most Compatible) or export as JPG/PNG.'
    })
  }
}

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  await requireUserSession(event)

  const contentType = getHeader(event, 'content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    const titlePart = formData?.find(part => part.name === 'imageTitle')
    const ingredientsPart = formData?.find(part => part.name === 'imageIngredients')
    const methodPart = formData?.find(part => part.name === 'imageMethod')
    const imagePart = formData?.find(part => part.name === 'image')

    const triptych = titlePart && ingredientsPart && methodPart
    if (triptych) {
      assertImagePart('imageTitle', titlePart.data, titlePart.type)
      assertImagePart('imageIngredients', ingredientsPart.data, ingredientsPart.type)
      assertImagePart('imageMethod', methodPart.data, methodPart.type)

      return await extractRecipeFromRegionImages(
        titlePart.data!.toString('base64'),
        ingredientsPart.data!.toString('base64'),
        methodPart.data!.toString('base64'),
        event,
        titlePart.type,
        ingredientsPart.type,
        methodPart.type
      )
    }

    if (imagePart?.data && imagePart.data.length > MAX_IMAGE_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Image is too large. Please upload an image under 8MB.'
      })
    }

    const imageMimeType = imagePart?.type

    if (imageMimeType && ['image/heic', 'image/heif'].includes(imageMimeType.toLowerCase())) {
      throw createError({
        statusCode: 415,
        statusMessage: 'HEIC/HEIF images are not supported yet. Please switch camera format to JPEG (Most Compatible) or export as JPG/PNG.'
      })
    }

    if (!imagePart?.data || imagePart.data.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Image file is required, or send imageTitle, imageIngredients, and imageMethod together.'
      })
    }

    const imageBase64 = imagePart.data.toString('base64')
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
  }

  const body = await readBody<ExtractRequestBody>(event)
  let imageBase64: string | undefined
  let imageMimeType: string | undefined
  if (typeof body?.imageBase64 === 'string') {
    imageBase64 = body.imageBase64
  }
  if (typeof body?.imageMimeType === 'string') {
    imageMimeType = body.imageMimeType
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
