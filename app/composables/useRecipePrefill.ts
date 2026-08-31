import { compressImageForUpload } from '~/utils/imageCompression'
import {
  createEmptyIngredient,
  createEmptyStep,
  createRowId,
  type RecipeStepRow
} from '~/utils/recipeFormRows'
import {
  COUNT_UNIT,
  formatIngredientLine,
  normalizeParsedIngredient,
  type ParsedSpoonacularIngredient
} from '~~/shared/utils/formatIngredient'
import type { IngredientRowModel } from '~/components/IngredientRow.vue'

export type ExtractionApplyMode = 'fill-empty' | 'replace-all'

export interface ExtractedRecipeResponse {
  title?: string
  description?: string
  servings?: number
  ingredients?: Array<{
    amount?: string
    unit?: string
    ingredientName?: string
    notes?: string
  }>
  steps?: Array<{
    title?: string
    content?: string
  }>
  tags?: string[]
  source?: string
}

export interface RecipePrefillFormSnapshot {
  title: string
  description: string
  tags: string[]
  servings: number | null
  ingredients: IngredientRowModel[]
  steps: RecipeStepRow[]
}

export interface RecipePrefillPatch {
  title?: string
  description?: string
  tags?: string[]
  servings?: number | null
  ingredients?: IngredientRowModel[]
  steps?: RecipeStepRow[]
}

const MAX_EXTRACTION_FILE_SIZE_BYTES = 8 * 1024 * 1024
const HEIC_EXTENSIONS = ['.heic', '.heif']
const COMPRESS_IF_LARGER_THAN = 400 * 1024
const UPLOAD_MAX_DIMENSION = 1600
const UPLOAD_JPEG_QUALITY = 0.8

const normalizeUnit = (unit: string) => {
  const normalized = unit.trim().toLowerCase()
  const unitMap: Record<string, string> = {
    cup: 'cups',
    cups: 'cups',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    gram: 'grams',
    grams: 'grams',
    g: 'grams',
    kilogram: 'kg',
    kilograms: 'kg',
    kg: 'kg',
    ounce: 'oz',
    ounces: 'oz',
    oz: 'oz',
    pound: 'lb',
    pounds: 'lb',
    lb: 'lb',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    l: 'l',
    liter: 'l',
    liters: 'l',
    litre: 'l',
    litres: 'l',
    piece: COUNT_UNIT,
    pieces: COUNT_UNIT,
    item: COUNT_UNIT,
    items: COUNT_UNIT,
    whole: COUNT_UNIT,
    each: COUNT_UNIT,
    clove: 'cloves',
    cloves: 'cloves',
    slice: 'slices',
    slices: 'slices'
  }
  return unitMap[normalized] || COUNT_UNIT
}

const hasMeaningfulIngredients = (ingredients: IngredientRowModel[]) => {
  return ingredients.some(ingredient =>
    Boolean(
      ingredient.ingredientName.trim()
      || ingredient.amount.trim()
      || (ingredient.notes || '').trim()
      || (ingredient.lineText || '').trim()
    )
  )
}

const hasMeaningfulSteps = (steps: RecipeStepRow[]) => {
  return steps.some(step => Boolean(step.title.trim() || step.content.trim()))
}

export const toExtractedIngredients = (ingredients: ExtractedRecipeResponse['ingredients']) => {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return []
  }

  return ingredients
    .map((ingredient) => {
      const amount = String(ingredient.amount || '').trim()
      const unit = normalizeUnit(String(ingredient.unit || COUNT_UNIT))
      const ingredientName = String(ingredient.ingredientName || '').trim()
      const notes = String(ingredient.notes || '').trim()
      return {
        rowId: createRowId('ingredient'),
        lineText: formatIngredientLine({ amount, unit, name: ingredientName, notes }),
        amount,
        unit,
        ingredientName,
        notes,
        parseStatus: 'idle' as const
      } satisfies IngredientRowModel
    })
    .filter(ingredient => ingredient.ingredientName)
}

export const toExtractedSteps = (steps: ExtractedRecipeResponse['steps']) => {
  if (!Array.isArray(steps) || steps.length === 0) {
    return []
  }

  const inferStepTitle = (title: string, content: string, index: number) => {
    const trimmedTitle = title.trim()
    const isNumericTitle = /^(?:step\s*)?\d+[).:\-]*$/i.test(trimmedTitle)
    if (trimmedTitle && !isNumericTitle) {
      return trimmedTitle
    }

    const cleaned = content
      .replace(/^\s*(?:step\s*)?\d+[).:\-]*\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) {
      return `Step ${index + 1}`
    }

    const sentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned
    const words = sentence.split(/\s+/).filter(Boolean).slice(0, 6)
    if (words.length === 0) {
      return `Step ${index + 1}`
    }

    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()
    return words.join(' ').replace(/[,:;]+$/, '').trim() || `Step ${index + 1}`
  }

  return steps
    .map((step, index) => {
      const content = String(step.content || '').trim()
      return {
        rowId: createRowId('step'),
        title: inferStepTitle(String(step.title || ''), content, index),
        content
      }
    })
    .filter(step => step.content)
}

export const mergeExtractedRecipe = (
  current: RecipePrefillFormSnapshot,
  extracted: ExtractedRecipeResponse,
  mode: ExtractionApplyMode
): RecipePrefillPatch => {
  const patch: RecipePrefillPatch = {}

  if (mode === 'replace-all') {
    if (extracted.title) patch.title = extracted.title.trim()
    if (extracted.description !== undefined) patch.description = String(extracted.description || '').trim()
  } else {
    if (!current.title.trim() && extracted.title) patch.title = extracted.title.trim()
    if (!current.description.trim() && extracted.description) patch.description = extracted.description.trim()
  }

  if (Array.isArray(extracted.tags) && extracted.tags.length > 0) {
    const mergedTags = [...current.tags]
    for (const tag of extracted.tags) {
      const normalizedTag = String(tag || '').trim().replace(/\s+/g, ' ')
      if (!normalizedTag) continue
      if (!mergedTags.some(existing => existing.toLowerCase() === normalizedTag.toLowerCase())) {
        mergedTags.push(normalizedTag)
      }
    }
    patch.tags = mergedTags
  }

  if (extracted.servings !== undefined && extracted.servings > 0) {
    if (mode === 'replace-all' || current.servings == null) {
      patch.servings = extracted.servings
    }
  }

  const extractedIngredients = toExtractedIngredients(extracted.ingredients)
  const extractedSteps = toExtractedSteps(extracted.steps)

  if (mode === 'replace-all') {
    patch.ingredients = extractedIngredients.length > 0 ? extractedIngredients : [createEmptyIngredient()]
    patch.steps = extractedSteps.length > 0 ? extractedSteps : [createEmptyStep()]
  } else {
    if (extractedIngredients.length > 0) {
      if (!hasMeaningfulIngredients(current.ingredients)) {
        patch.ingredients = extractedIngredients
      } else {
        patch.ingredients = [...current.ingredients, ...extractedIngredients]
      }
    }
    if (extractedSteps.length > 0) {
      if (!hasMeaningfulSteps(current.steps)) {
        patch.steps = extractedSteps
      } else {
        patch.steps = [...current.steps, ...extractedSteps]
      }
    }
  }

  const ingredients = patch.ingredients ?? current.ingredients
  const steps = patch.steps ?? current.steps
  if (ingredients.length === 0) {
    patch.ingredients = [createEmptyIngredient()]
  }
  if (steps.length === 0) {
    patch.steps = [createEmptyStep()]
  }

  return patch
}

export const applyPrefillPatch = (
  current: RecipePrefillFormSnapshot,
  patch: RecipePrefillPatch
): RecipePrefillFormSnapshot => ({
  title: patch.title ?? current.title,
  description: patch.description ?? current.description,
  tags: patch.tags ?? current.tags,
  servings: patch.servings !== undefined ? patch.servings : current.servings,
  ingredients: patch.ingredients ?? current.ingredients,
  steps: patch.steps ?? current.steps
})

export const hydrateExtractedIngredients = async (ingredients: IngredientRowModel[]) => {
  const tasks = ingredients
    .map((ingredient, index) => ({ index, ingredient }))
    .filter(({ ingredient }) =>
      Boolean((ingredient.lineText || '').trim())
      && !ingredient.spoonacularIngredientId
    )

  if (tasks.length === 0) {
    return ingredients
  }

  const lines = tasks.map(task => task.ingredient.lineText.trim())
  let parsed: ParsedSpoonacularIngredient[] = []
  try {
    parsed = await $fetch<ParsedSpoonacularIngredient[]>('/api/spoonacular/ingredients/parse', {
      method: 'POST',
      body: { ingredients: lines }
    })
  } catch (error) {
    console.error('Failed to parse extracted ingredients:', error)
    return ingredients
  }

  if (!Array.isArray(parsed)) {
    return ingredients
  }

  const byOriginal = new Map<string, ParsedSpoonacularIngredient>()
  for (const item of parsed) {
    const key = String(item.original || '').trim().toLowerCase()
    if (key && !byOriginal.has(key)) {
      byOriginal.set(key, item)
    }
  }

  const nextIngredients = [...ingredients]
  tasks.forEach((task, position) => {
    const line = lines[position]
    const match = byOriginal.get(line.toLowerCase()) || parsed[position]
    if (!match || !match.name) {
      return
    }
    const normalized = normalizeParsedIngredient(match)
    const row = { ...nextIngredients[task.index] }
    row.amount = normalized.amount || row.amount
    row.unit = normalized.unit || row.unit
    row.ingredientName = normalized.ingredientName || row.ingredientName
    if (normalized.notes) row.notes = normalized.notes
    row.spoonacularIngredientId = normalized.spoonacularIngredientId
    row.spoonacularData = normalized.spoonacularData
    row.lineText = formatIngredientLine({
      amount: row.amount,
      unit: row.unit,
      name: row.ingredientName,
      notes: row.notes
    })
    row.parseStatus = normalized.spoonacularIngredientId ? 'matched' : 'parsed'
    nextIngredients[task.index] = row
  })

  return nextIngredients
}

export const inferMimeTypeFromName = (name?: string) => {
  const lowerName = (name || '').toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.heic')) return 'image/heic'
  if (lowerName.endsWith('.heif')) return 'image/heif'
  return ''
}

export const getFirstFile = (files: unknown) => {
  if (!files) {
    return null
  }

  const rawFiles = files instanceof FileList
    ? Array.from(files)
    : (Array.isArray(files) ? files : [files])

  const firstEntry = rawFiles[0] as any
  if (!firstEntry) {
    return null
  }

  if (firstEntry instanceof File) {
    return firstEntry
  }

  if (firstEntry.file instanceof File) {
    return firstEntry.file
  }

  if (firstEntry.raw instanceof File) {
    return firstEntry.raw
  }

  if (firstEntry instanceof Blob) {
    return new File([firstEntry], 'image-upload', {
      type: firstEntry.type || inferMimeTypeFromName() || 'application/octet-stream',
      lastModified: Date.now()
    })
  }

  if (firstEntry.blob instanceof Blob) {
    const blob = firstEntry.blob as Blob
    const name = typeof firstEntry.name === 'string' && firstEntry.name.trim().length > 0
      ? firstEntry.name
      : 'image-upload'
    return new File([blob], name, {
      type: blob.type || inferMimeTypeFromName(name) || 'application/octet-stream',
      lastModified: Date.now()
    })
  }

  return null
}

export const isHeicLike = (file: File) => {
  const lowerType = (file.type || '').toLowerCase()
  const lowerName = (file.name || '').toLowerCase()
  return lowerType === 'image/heic'
    || lowerType === 'image/heif'
    || HEIC_EXTENSIONS.some(ext => lowerName.endsWith(ext))
}

export const isSupportedExtractionImage = (mimeType: string) => {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
}

export const formatFileSize = (size: number) => {
  if (!size || size < 0) {
    return ''
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const runExtractionTriRegion = async (regions: { title: Blob; ingredients: Blob; method: Blob }) => {
  const fd = new FormData()
  fd.append('imageTitle', new File([regions.title], 'title.jpg', { type: 'image/jpeg' }))
  fd.append('imageIngredients', new File([regions.ingredients], 'ingredients.jpg', { type: 'image/jpeg' }))
  fd.append('imageMethod', new File([regions.method], 'method.jpg', { type: 'image/jpeg' }))
  return $fetch<ExtractedRecipeResponse>('/api/recipes/extract', {
    method: 'POST',
    body: fd
  })
}

const runExtractionForFile = async (uploadFile: File) => {
  const effectiveType = (uploadFile.type || inferMimeTypeFromName(uploadFile.name) || '').toLowerCase()

  if (!isSupportedExtractionImage(effectiveType)) {
    throw createError({ statusCode: 415, statusMessage: 'Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.' })
  }

  const requestBody = new FormData()
  requestBody.append('image', uploadFile)

  return $fetch<ExtractedRecipeResponse>('/api/recipes/extract', {
    method: 'POST',
    body: requestBody
  })
}

const mapExtractionError = (error: any) => {
  const detailMessage = typeof error?.data?.detail === 'string' ? error.data.detail : ''
  const rawMessage = detailMessage || error?.data?.statusMessage || error?.statusMessage || error?.message || ''
  if (rawMessage.includes('NotReadableError') || rawMessage.includes('The requested file could not be read')) {
    return 'We could not read that image file. Please re-select it (or save it locally) and try again.'
  }
  if (rawMessage.includes('AI binding not available') || rawMessage.includes('AI Gateway ID not configured')) {
    return 'AI scanning is not configured in this environment yet. Add the Cloudflare AI env vars, then retry.'
  }
  if (rawMessage.includes('rate limit exceeded')) {
    return 'AI scanning is temporarily rate-limited. Please wait a moment and try again.'
  }
  if (rawMessage.includes('quota exceeded')) {
    return 'AI scanning quota is exhausted. Please check your Cloudflare plan and limits.'
  }
  if (rawMessage.includes('No extractable recipe content found')) {
    return 'We could not confidently read this recipe page. Try two tighter crops: one for ingredients and one for method, with flat framing and even lighting.'
  }
  return rawMessage || 'Unable to extract recipe from image.'
}

export function useRecipePrefill(options: {
  isEdit?: MaybeRefOrGetter<boolean>
  formSnapshot: MaybeRefOrGetter<RecipePrefillFormSnapshot>
}) {
  const extractionFile = ref<any>(null)
  const extractionMethodFile = ref<any>(null)
  const extractionApplyMode = ref<ExtractionApplyMode>(toValue(options.isEdit) ? 'fill-empty' : 'replace-all')
  const extractingRecipe = ref(false)
  const extractionError = ref<string | null>(null)
  const extractionSummary = ref<string | null>(null)
  const hydratingPrefilledIngredients = ref(false)
  const extractionPreviewUrl = ref<string | null>(null)
  const extractionCompressionNote = ref<string | null>(null)
  const extractionMethodCompressionNote = ref<string | null>(null)
  const triRegionCrops = ref<{ title: Blob; ingredients: Blob; method: Blob } | null>(null)
  const regionCropModalOpen = ref(false)
  const isProcessingExtractionSelection = ref(false)

  const extractionPreviewFile = computed(() => getFirstFile(extractionFile.value))
  const extractionPreviewFileName = computed(() => extractionPreviewFile.value?.name || '')
  const extractionPreviewFileSizeText = computed(() => {
    const size = extractionPreviewFile.value?.size
    return formatFileSize(size || 0)
  })
  const hasExtractionFile = computed(() => {
    if (!extractionFile.value) {
      return false
    }
    const files = extractionFile.value instanceof FileList
      ? Array.from(extractionFile.value)
      : (Array.isArray(extractionFile.value) ? extractionFile.value : [extractionFile.value])
    return files.length > 0
  })

  const clearTriRegionCrops = () => {
    triRegionCrops.value = null
  }

  const onRegionCropsComplete = (payload: { title: Blob; ingredients: Blob; method: Blob }) => {
    triRegionCrops.value = payload
    regionCropModalOpen.value = false
  }

  const clearExtractionFile = () => {
    extractionFile.value = null
    extractionMethodFile.value = null
    extractionCompressionNote.value = null
    extractionMethodCompressionNote.value = null
    triRegionCrops.value = null
    regionCropModalOpen.value = false
  }

  const extractAndPrefill = async (): Promise<RecipePrefillPatch | null> => {
    extractionError.value = null
    extractionSummary.value = null

    const file = getFirstFile(extractionFile.value)
    if (!(file instanceof File)) {
      extractionError.value = 'Please select an image to scan.'
      return null
    }

    if (isHeicLike(file)) {
      extractionError.value = 'HEIC/HEIF photos are not supported yet. On iPhone, switch Camera > Formats to "Most Compatible" or convert to JPG/PNG before scanning.'
      return null
    }

    const regions = triRegionCrops.value
    if (regions) {
      for (const blob of [regions.title, regions.ingredients, regions.method]) {
        if (blob.size > MAX_EXTRACTION_FILE_SIZE_BYTES) {
          extractionError.value = 'One cropped region is too large (max 8MB per image). Tighten the crop and try again.'
          return null
        }
      }
    }

    const uploadFile = await compressImageForUpload(file, {
      compressIfLargerThan: COMPRESS_IF_LARGER_THAN,
      maxDimension: UPLOAD_MAX_DIMENSION,
      jpegQuality: UPLOAD_JPEG_QUALITY
    })

    if (uploadFile !== file) {
      extractionCompressionNote.value = `Image optimised for upload (${formatFileSize(file.size)} -> ${formatFileSize(uploadFile.size)}).`
      extractionFile.value = uploadFile
    }

    if (uploadFile.size <= 0) {
      extractionError.value = 'This image appears empty. Please re-select the photo and try again.'
      return null
    }

    if (!regions && uploadFile.size > MAX_EXTRACTION_FILE_SIZE_BYTES) {
      extractionError.value = 'Image is too large for AI scan (max 8MB). Please crop/resize and try again.'
      return null
    }

    extractingRecipe.value = true
    let workingSnapshot = toValue(options.formSnapshot)

    try {
      if (regions) {
        const extracted = await runExtractionTriRegion(regions)
        let patch = mergeExtractedRecipe(workingSnapshot, extracted, extractionApplyMode.value)
        workingSnapshot = applyPrefillPatch(workingSnapshot, patch)

        hydratingPrefilledIngredients.value = true
        try {
          const hydrated = await hydrateExtractedIngredients(workingSnapshot.ingredients)
          patch = { ...patch, ingredients: hydrated }
          workingSnapshot = { ...workingSnapshot, ingredients: hydrated }
        } finally {
          hydratingPrefilledIngredients.value = false
        }

        const ingCount = Array.isArray(extracted.ingredients) ? extracted.ingredients.length : 0
        const stepCount = Array.isArray(extracted.steps) ? extracted.steps.length : 0
        extractionSummary.value = `Prefill complete (three-region scan): ${ingCount} ingredients and ${stepCount} steps extracted.`
        clearExtractionFile()
        return patch
      }

      const extracted = await runExtractionForFile(uploadFile)
      let patch = mergeExtractedRecipe(workingSnapshot, extracted, extractionApplyMode.value)
      workingSnapshot = applyPrefillPatch(workingSnapshot, patch)

      const methodFile = getFirstFile(extractionMethodFile.value)
      let methodExtractedIngredientCount = 0
      let methodExtractedStepCount = 0

      if (methodFile instanceof File && !isHeicLike(methodFile)) {
        const optimizedMethodFile = await compressImageForUpload(methodFile, {
          compressIfLargerThan: COMPRESS_IF_LARGER_THAN,
          maxDimension: UPLOAD_MAX_DIMENSION,
          jpegQuality: UPLOAD_JPEG_QUALITY
        })
        if (optimizedMethodFile !== methodFile) {
          extractionMethodCompressionNote.value = `Method image optimised (${formatFileSize(methodFile.size)} -> ${formatFileSize(optimizedMethodFile.size)}).`
        }
        const methodExtracted = await runExtractionForFile(optimizedMethodFile)
        const methodPatch = mergeExtractedRecipe(workingSnapshot, methodExtracted, 'fill-empty')
        patch = { ...patch, ...methodPatch }
        workingSnapshot = applyPrefillPatch(workingSnapshot, methodPatch)
        methodExtractedIngredientCount = Array.isArray(methodExtracted.ingredients) ? methodExtracted.ingredients.length : 0
        methodExtractedStepCount = Array.isArray(methodExtracted.steps) ? methodExtracted.steps.length : 0
      }

      hydratingPrefilledIngredients.value = true
      try {
        const hydrated = await hydrateExtractedIngredients(workingSnapshot.ingredients)
        patch = { ...patch, ingredients: hydrated }
      } finally {
        hydratingPrefilledIngredients.value = false
      }

      const extractedIngredientCount = Array.isArray(extracted.ingredients) ? extracted.ingredients.length : 0
      const extractedStepCount = Array.isArray(extracted.steps) ? extracted.steps.length : 0
      const totalIngredients = extractedIngredientCount + methodExtractedIngredientCount
      const totalSteps = extractedStepCount + methodExtractedStepCount
      extractionSummary.value = `Prefill complete: ${totalIngredients} ingredients and ${totalSteps} steps extracted.`
      clearExtractionFile()
      return patch
    } catch (error: any) {
      extractionError.value = mapExtractionError(error)
      return null
    } finally {
      extractingRecipe.value = false
    }
  }

  watch(extractionPreviewFile, (nextFile) => {
    triRegionCrops.value = null
    if (extractionPreviewUrl.value) {
      URL.revokeObjectURL(extractionPreviewUrl.value)
      extractionPreviewUrl.value = null
    }

    if (nextFile instanceof File) {
      extractionPreviewUrl.value = URL.createObjectURL(nextFile)
    }
  })

  watch(extractionFile, async (files) => {
    if (!files || isProcessingExtractionSelection.value) {
      return
    }

    const file = getFirstFile(files)
    if (!(file instanceof File) || isHeicLike(file)) {
      return
    }

    isProcessingExtractionSelection.value = true
    try {
      const compressed = await compressImageForUpload(file, {
        compressIfLargerThan: COMPRESS_IF_LARGER_THAN,
        maxDimension: UPLOAD_MAX_DIMENSION,
        jpegQuality: UPLOAD_JPEG_QUALITY
      })
      if (compressed !== file) {
        extractionCompressionNote.value = `Image optimised for upload (${formatFileSize(file.size)} -> ${formatFileSize(compressed.size)}).`
        extractionFile.value = compressed
      }
    } finally {
      isProcessingExtractionSelection.value = false
    }
  })

  watch(extractionMethodFile, async (files) => {
    if (!files || isProcessingExtractionSelection.value) {
      return
    }

    const file = getFirstFile(files)
    if (!(file instanceof File) || isHeicLike(file)) {
      return
    }

    isProcessingExtractionSelection.value = true
    try {
      const compressed = await compressImageForUpload(file, {
        compressIfLargerThan: COMPRESS_IF_LARGER_THAN,
        maxDimension: UPLOAD_MAX_DIMENSION,
        jpegQuality: UPLOAD_JPEG_QUALITY
      })
      if (compressed !== file) {
        extractionMethodCompressionNote.value = `Method image optimised (${formatFileSize(file.size)} -> ${formatFileSize(compressed.size)}).`
        extractionMethodFile.value = compressed
      }
    } finally {
      isProcessingExtractionSelection.value = false
    }
  })

  onBeforeUnmount(() => {
    if (extractionPreviewUrl.value) {
      URL.revokeObjectURL(extractionPreviewUrl.value)
      extractionPreviewUrl.value = null
    }
  })

  return {
    extractionFile,
    extractionMethodFile,
    extractionApplyMode,
    extractingRecipe,
    extractionError,
    extractionSummary,
    hydratingPrefilledIngredients,
    extractionPreviewUrl,
    extractionCompressionNote,
    extractionMethodCompressionNote,
    triRegionCrops,
    regionCropModalOpen,
    extractionPreviewFileName,
    extractionPreviewFileSizeText,
    hasExtractionFile,
    clearTriRegionCrops,
    onRegionCropsComplete,
    clearExtractionFile,
    extractAndPrefill
  }
}
