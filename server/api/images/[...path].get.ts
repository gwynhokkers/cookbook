import { blob } from 'hub:blob'

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')
  
  if (!path) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Image path is required'
    })
  }

  try {
    // Use blob.serve() to properly serve the file from blob storage
    // This handles content-type, headers, and streaming correctly
    return await blob.serve(event, path)
  } catch (error: any) {
    console.error('Error serving image:', error, { path })
    if (error.statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to serve image'
    })
  }
})
