import { requireAuth } from '../../utils/requireAuth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  
  // @ts-expect-error - hub:blob is a virtual import resolved by Nitro
  const { blob, ensureBlob } = await import('hub:blob')

  const formData = await readFormData(event)
  const file = formData.get('image') as File

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No image file provided'
    })
  }

  // Validate file
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  ensureBlob(buffer, {
    maxSize: '5MB',
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  })

  // Generate unique filename
  const timestamp = Date.now()
  const extension = file.name.split('.').pop() || 'jpg'
  const filename = `recipes/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`

  // Upload to blob storage
  const uploaded = await blob.put(filename, buffer, {
    access: 'public',
    contentType: file.type
  })

  return {
    url: uploaded.url,
    path: filename
  }
})
