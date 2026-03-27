const DEFAULT_COMPRESS_IF_LARGER_THAN = 400 * 1024
const DEFAULT_UPLOAD_MAX_DIMENSION = 1600
const DEFAULT_UPLOAD_JPEG_QUALITY = 0.8

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export interface CompressImageOptions {
  compressIfLargerThan?: number
  maxDimension?: number
  jpegQuality?: number
}

const toJpegName = (name: string) => {
  if (!name) {
    return 'upload.jpg'
  }
  return name.replace(/\.[^.]+$/i, '.jpg')
}

/** Resize and compress large images before upload to reduce mobile memory pressure and payload size. */
export async function compressImageForUpload(file: File, options: CompressImageOptions = {}): Promise<File> {
  if (typeof window === 'undefined') {
    return file
  }

  const compressIfLargerThan = options.compressIfLargerThan ?? DEFAULT_COMPRESS_IF_LARGER_THAN
  const maxDimension = options.maxDimension ?? DEFAULT_UPLOAD_MAX_DIMENSION
  const jpegQuality = options.jpegQuality ?? DEFAULT_UPLOAD_JPEG_QUALITY
  const lowerType = (file.type || '').toLowerCase()

  if (file.size <= compressIfLargerThan || !ALLOWED_TYPES.includes(lowerType)) {
    return file
  }

  return await new Promise<File>((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    image.onload = () => {
      URL.revokeObjectURL(url)

      const width = image.naturalWidth
      const height = image.naturalHeight
      if (!width || !height) {
        resolve(file)
        return
      }

      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const canvasWidth = Math.max(1, Math.round(width * scale))
      const canvasHeight = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight

      const context = canvas.getContext('2d')
      if (!context) {
        resolve(file)
        return
      }

      context.drawImage(image, 0, 0, canvasWidth, canvasHeight)
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0 || blob.size >= file.size) {
          resolve(file)
          return
        }

        resolve(new File([blob], toJpegName(file.name), {
          type: 'image/jpeg',
          lastModified: Date.now()
        }))
      }, 'image/jpeg', jpegQuality)
    }

    image.src = url
  })
}
