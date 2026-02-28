import { createRecipe } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, createRecipe)
  
  const { blob, ensureBlob } = await import('hub:blob')

  const formData = await readFormData(event)
  const file = formData.get('image') as File

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No image file provided'
    })
  }

  // Validate file - ensureBlob expects a Blob/File, not a Buffer
  // File extends Blob, so we can pass it directly
  ensureBlob(file, {
    maxSize: '4MB',
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  })

  // Convert to buffer for blob.put() which may need Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Generate unique filename
  const timestamp = Date.now()
  const extension = file.name.split('.').pop() || 'jpg'
  const filename = `recipes/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`

  // Upload to blob storage
  const uploaded = await blob.put(filename, buffer, {
    access: 'public',
    contentType: file.type
  })

  // For local filesystem storage, construct a proper URL using our serving endpoint
  // The blob.put() might return a pathname or URL, but we'll use our endpoint for consistency
  const imageUrl = uploaded.url || `/api/images/${filename}`

  return {
    url: imageUrl,
    path: filename
  }
})
