<template>
  <UForm
    :state="state"
    :schema="schema"
    @submit="onSubmit"
    class="space-y-8"
  >
    <div class="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div>
        <h3 class="text-base font-semibold">Scan cookbook page (AI prefill)</h3>
        <p class="text-sm text-muted">
          Upload a photo/scan of a recipe page and we will prefill this form automatically.
        </p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <UFormField label="Cookbook page image">
          <ImageSourcePicker
            v-model="extractionFile"
            description="Take a photo or choose from library. One recipe per image, max 8MB (JPG/PNG/WEBP/GIF)."
          />
          <div v-if="extractionPreviewUrl" class="mt-3 rounded-lg border border-default p-3 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium truncate">
                {{ extractionPreviewFileName || 'Selected image' }}
              </p>
              <UButton
                type="button"
                size="xs"
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="clearExtractionFile"
              >
                Remove
              </UButton>
            </div>
            <NuxtImg
              :src="extractionPreviewUrl"
              alt="Selected cookbook page preview"
              class="w-full max-w-sm rounded-md border border-default object-cover"
              width="480"
              height="320"
              loading="lazy"
            />
            <p class="text-xs text-muted">
              {{ extractionPreviewFileSizeText }}
            </p>
            <p v-if="extractionCompressionNote" class="text-xs text-muted">
              {{ extractionCompressionNote }}
            </p>
          </div>
        </UFormField>

        <UFormField label="Optional method image">
          <ImageSourcePicker
            v-model="extractionMethodFile"
            description="If you use a single full-page scan (not three-region), add a second photo of the method column to improve steps."
          />
          <p v-if="extractionMethodCompressionNote" class="mt-2 text-xs text-muted">
            {{ extractionMethodCompressionNote }}
          </p>
        </UFormField>

        <UFormField
          label="Apply mode"
          help="Fill empty keeps your existing values. Replace all overwrites title, description, ingredients, and steps."
        >
          <USelect
            v-model="extractionApplyMode"
            :items="[
              { label: 'Fill empty fields', value: 'fill-empty' },
              { label: 'Replace all recipe fields', value: 'replace-all' }
            ]"
          />
        </UFormField>

        <div
          v-if="extractionPreviewUrl"
          class="space-y-2 rounded-lg border border-dashed border-default p-3 md:col-span-2"
        >
          <p class="text-sm text-muted">
            Dense or two-column pages: crop this image into three regions (title, ingredients, method) so the AI reads each part clearly. This runs three focused scans instead of one full page.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              type="button"
              variant="outline"
              size="sm"
              @click="regionCropModalOpen = true"
            >
              Crop title, ingredients &amp; method
            </UButton>
            <UButton
              v-if="triRegionCrops"
              type="button"
              variant="ghost"
              size="sm"
              @click="clearTriRegionCrops"
            >
              Clear region crops
            </UButton>
          </div>
          <p v-if="triRegionCrops" class="text-xs text-primary">
            Three region crops are ready — Scan and prefill will use them instead of the full page image.
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <UButton
          type="button"
          icon="i-heroicons-sparkles"
          size="lg"
          class="w-full justify-center sm:w-auto"
          :loading="extractingRecipe"
          :disabled="!hasExtractionFile || extractingRecipe || submitting || uploadingFile"
          @click="extractAndPrefill"
        >
          Scan and prefill
        </UButton>
        <UButton
          type="button"
          variant="outline"
          size="lg"
          class="w-full justify-center sm:w-auto"
          :disabled="!hasExtractionFile || extractingRecipe"
          @click="clearExtractionFile"
        >
          Clear image
        </UButton>
      </div>

      <UAlert
        v-if="extractionError"
        color="error"
        variant="soft"
        :title="extractionError"
      />
      <UAlert
        v-if="extractionSummary"
        color="success"
        variant="soft"
        :title="extractionSummary"
      />
      <div v-if="hydratingPrefilledIngredients" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <span>Matching extracted ingredients to your ingredient library...</span>
      </div>

      <Teleport to="body">
        <div
          v-if="regionCropModalOpen && extractionPreviewUrl"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          @click.self="regionCropModalOpen = false"
        >
          <div class="bg-default max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-default p-4 shadow-xl">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h4 class="text-sm font-semibold">
                Define three regions
              </h4>
              <UButton
                icon="i-heroicons-x-mark"
                variant="ghost"
                size="xs"
                @click="regionCropModalOpen = false"
              />
            </div>
            <RecipePageRegionCropper
              :image-src="extractionPreviewUrl"
              @complete="onRegionCropsComplete"
              @cancel="regionCropModalOpen = false"
            />
          </div>
        </div>
      </Teleport>
    </div>

    <div class="rounded-xl border border-default p-5 space-y-5">
      <div>
        <h3 class="text-base font-semibold">Recipe details</h3>
        <p class="text-sm text-muted">
          Start with the essentials so your recipe is easy to discover and cook.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Title" name="title" required class="md:col-span-2">
          <UInput v-model="state.title" placeholder="e.g. Classic Chocolate Chip Cookies" />
        </UFormField>

        <UFormField label="Date" name="date" required>
          <UInput v-model="state.date" type="date" />
        </UFormField>

        <UFormField label="Visibility" name="visibility">
          <USelect
            v-model="state.visibility"
            :items="[
              { label: 'Public — visible to everyone', value: 'public' },
              { label: 'Private — signed-in users only', value: 'private' }
            ]"
          />
        </UFormField>

        <UFormField
          label="Source"
          name="source"
          class="md:col-span-2"
          help="Cookbook title and page, blog name, or a web address — whatever you use to remember where this came from."
        >
          <UInput v-model="state.source" placeholder="e.g. Ottolenghi Simple p. 142, or https://…" />
        </UFormField>

        <UFormField label="Description" name="description" class="md:col-span-2">
          <UTextarea
            v-model="state.description"
            :rows="4"
            placeholder="Add context, flavor notes, or serving suggestions..."
          />
        </UFormField>
      </div>
    </div>

    <div class="rounded-xl border border-default p-5 space-y-4">
      <div>
        <h3 class="text-base font-semibold">Image</h3>
        <p class="text-sm text-muted">
          A photo helps your recipe stand out in lists.
        </p>
      </div>

      <UFormField label="Recipe image" name="imageUrl">
        <div class="space-y-4">
          <div v-if="state.imageUrl && !uploadingFile" class="relative">
            <NuxtImg
              :src="state.imageUrl"
              alt="Recipe image"
              class="w-full max-w-md rounded-lg"
              width="400"
              height="300"
              loading="lazy"
              provider="blob"
            />
            <UButton
              type="button"
              icon="i-heroicons-x-mark"
              color="error"
              variant="solid"
              class="absolute top-2 right-2"
              @click="clearImage"
            />
          </div>

          <ImageSourcePicker
            v-model="selectedFile"
            :label="state.imageUrl ? 'Replace image' : 'Upload image'"
            description="JPG, PNG, WEBP or GIF (max. 4MB)"
            :disabled="uploadingFile"
          />

          <div v-if="uploadingFile" class="flex items-center gap-2 text-sm">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
            <span>Uploading image...</span>
          </div>
          <p v-if="uploadCompressionNote" class="text-xs text-muted">
            {{ uploadCompressionNote }}
          </p>

          <UAlert
            v-if="uploadError"
            color="error"
            variant="soft"
            :title="uploadError"
          />
        </div>
      </UFormField>
    </div>

    <div class="rounded-xl border border-default p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold">Tags</h3>
          <p class="text-sm text-muted">Press Enter or click Add to create a tag.</p>
        </div>
        <UBadge color="neutral" variant="subtle">{{ state.tags.length }} tags</UBadge>
      </div>

      <UFormField label="Recipe tags" name="tags">
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="(tag, index) in state.tags"
              :key="`${tag}-${index}`"
              color="primary"
              variant="subtle"
              class="inline-flex items-center gap-1"
            >
              <span>{{ tag }}</span>
              <UButton
                type="button"
                icon="i-heroicons-x-mark"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="removeTag(Number(index))"
              />
            </UBadge>
            <span v-if="state.tags.length === 0" class="text-sm text-muted">No tags added yet.</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <UInput
              v-model="newTag"
              placeholder="e.g. Dinner"
              @keyup.enter="addTag"
              class="w-full sm:max-w-xs"
            />
            <UButton
              type="button"
              icon="i-heroicons-plus"
              variant="outline"
              class="w-full sm:w-auto"
              @click="addTag"
            >
              Add tag
            </UButton>
          </div>
        </div>
      </UFormField>
    </div>

    <div class="rounded-xl border border-default p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold">Ingredients</h3>
          <p class="text-sm text-muted">
            Add amount, unit, and ingredient name for best shopping list results.
          </p>
        </div>
        <UBadge color="neutral" variant="subtle">{{ state.ingredients.length }} ingredients</UBadge>
      </div>

      <UFormField name="ingredients">
        <div class="space-y-4">
          <div
            v-for="(ingredient, index) in state.ingredients"
            :key="ingredient.rowId"
            class="rounded-xl border border-default p-4 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <UBadge color="neutral" variant="subtle">Ingredient {{ index + 1 }}</UBadge>
                <span v-if="ingredient.ingredientName" class="text-sm text-muted truncate max-w-48">
                  {{ ingredient.ingredientName }}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-up"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === 0"
                  @click="moveIngredient(index, index - 1)"
                />
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-down"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === state.ingredients.length - 1"
                  @click="moveIngredient(index, index + 1)"
                />
                <UButton
                  type="button"
                  icon="i-heroicons-trash"
                  color="error"
                  variant="ghost"
                  size="sm"
                  :disabled="state.ingredients.length === 1"
                  @click="removeIngredient(Number(index))"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div class="md:col-span-2">
                <UInput
                  v-model="ingredient.amount"
                  placeholder="Amount"
                  type="number"
                  step="0.1"
                />
              </div>
              <div class="md:col-span-3">
                <USelect
                  v-model="ingredient.unit"
                  :items="unitOptions"
                  class="w-full"
                  placeholder="Unit"
                />
              </div>
              <div class="md:col-span-7">
                <IngredientSelector
                  v-model="ingredient.ingredientName"
                  @select="handleIngredientSelect(index, $event)"
                />
              </div>
            </div>

            <UInput
              v-model="ingredient.notes"
              placeholder="Notes (optional, e.g. chopped, room temperature)"
              size="sm"
            />
          </div>

          <UButton
            type="button"
            icon="i-heroicons-plus"
            variant="outline"
            @click="addIngredient"
          >
            Add ingredient
          </UButton>
        </div>
      </UFormField>
    </div>

    <div class="rounded-xl border border-default p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold">Steps</h3>
          <p class="text-sm text-muted">
            Keep each step short and specific for better readability.
          </p>
        </div>
        <UBadge color="neutral" variant="subtle">{{ state.steps.length }} steps</UBadge>
      </div>

      <UFormField name="steps">
        <div class="space-y-4">
          <div
            v-for="(step, index) in state.steps"
            :key="step.rowId"
            class="rounded-xl border border-default p-4 space-y-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <UBadge color="neutral" variant="subtle">Step {{ Number(index) + 1 }}</UBadge>
              <div class="flex items-center gap-1">
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-up"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === 0"
                  @click="moveStep(Number(index), Number(index) - 1)"
                />
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-down"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === state.steps.length - 1"
                  @click="moveStep(Number(index), Number(index) + 1)"
                />
                <UButton
                  type="button"
                  icon="i-heroicons-trash"
                  color="error"
                  variant="ghost"
                  size="sm"
                  :disabled="state.steps.length === 1"
                  @click="removeStep(Number(index))"
                />
              </div>
            </div>

            <UFormField :name="`steps.${index}.title`">
              <UInput
                v-model="state.steps[index].title"
                placeholder="Step title (optional)"
                class="w-full"
              />
            </UFormField>
            <UFormField :name="`steps.${index}.content`">
              <UTextarea
                v-model="state.steps[index].content"
                placeholder="Step instructions"
                :rows="3"
                class="w-full"
              />
            </UFormField>
          </div>

          <UButton
            type="button"
            icon="i-heroicons-plus"
            variant="outline"
            @click="addStep"
          >
            Add step
          </UButton>
        </div>
      </UFormField>
    </div>

    <div class="sticky bottom-3 z-10 pb-[env(safe-area-inset-bottom)]">
      <div class="rounded-xl border border-default bg-default/95 backdrop-blur-sm p-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p class="text-sm text-muted">
          {{ isEdit ? 'Review changes and save when ready.' : 'Ready to publish your recipe?' }}
        </p>
        <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <UButton
            type="button"
            variant="outline"
            size="lg"
            class="w-full justify-center sm:w-auto"
            :disabled="submitting"
            @click="$emit('cancel')"
          >
            Cancel
          </UButton>
          <UButton
            type="submit"
            size="lg"
            class="w-full justify-center sm:w-auto"
            :loading="submitting"
            :disabled="isSubmitDisabled"
          >
            {{ isEdit ? 'Update Recipe' : 'Create Recipe' }}
          </UButton>
        </div>
      </div>
    </div>
  </UForm>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { compressImageForUpload } from '../utils/imageCompression'

const props = defineProps<{
  recipe?: any
  isEdit?: boolean
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [data: any]
  cancel: []
}>()

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  date: z.string().min(1, 'Date is required'),
  tags: z.array(z.string()).default([]),
  source: z.string().max(500),
  visibility: z.enum(['public', 'private']).default('public'),
  ingredients: z.array(z.object({
    amount: z.union([z.string(), z.number()]).transform(val => String(val)),
    unit: z.string(),
    ingredientName: z.string(),
    ingredientId: z.string().optional(),
    spoonacularIngredientId: z.number().optional(),
    spoonacularData: z.any().optional(),
    freeText: z.string().optional(), // For free-text input option
    notes: z.string().optional()
  })).default([]),
  steps: z.array(z.object({
    title: z.string(),
    content: z.string()
  })).default([])
})

const unitOptions = [
  { label: 'cups', value: 'cups' },
  { label: 'tbsp', value: 'tbsp' },
  { label: 'tsp', value: 'tsp' },
  { label: 'grams', value: 'grams' },
  { label: 'kg', value: 'kg' },
  { label: 'oz', value: 'oz' },
  { label: 'lb', value: 'lb' },
  { label: 'ml', value: 'ml' },
  { label: 'l', value: 'l' },
  { label: 'pieces', value: 'pieces' }
]

let rowIdCounter = 0
const createRowId = (prefix: 'ingredient' | 'step') => `${prefix}-${rowIdCounter++}`

const createEmptyIngredient = () => ({
  rowId: createRowId('ingredient'),
  amount: '',
  unit: 'cups',
  ingredientName: '',
  notes: ''
})

const createEmptyStep = () => ({
  rowId: createRowId('step'),
  title: '',
  content: ''
})

type ExtractionApplyMode = 'fill-empty' | 'replace-all'

interface ExtractedRecipeResponse {
  title?: string
  description?: string
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

const MAX_EXTRACTION_FILE_SIZE_BYTES = 8 * 1024 * 1024
const HEIC_EXTENSIONS = ['.heic', '.heif']
const COMPRESS_IF_LARGER_THAN = 400 * 1024
const UPLOAD_MAX_DIMENSION = 1600
const UPLOAD_JPEG_QUALITY = 0.8

// Load recipe ingredients if editing
const loadRecipeIngredients = async () => {
  if (props.recipe?.id) {
    try {
      const ingredients = await $fetch<Array<{
        amount: string
        unit: string
        ingredientId: string
        ingredient?: { name: string; spoonacularIngredientId?: string; spoonacularData?: any }
        notes?: string
      }>>(`/api/recipes/${props.recipe.id}/ingredients`)
      return ingredients.map((ri) => ({
        rowId: createRowId('ingredient'),
        amount: ri.amount,
        unit: ri.unit,
        ingredientName: ri.ingredient?.name || '',
        ingredientId: ri.ingredientId,
        spoonacularIngredientId: ri.ingredient?.spoonacularIngredientId ? Number(ri.ingredient.spoonacularIngredientId) : undefined,
        spoonacularData: ri.ingredient?.spoonacularData,
        notes: ri.notes || ''
      }))
    } catch (error) {
      console.error('Failed to load recipe ingredients:', error)
      return []
    }
  }
  return []
}

const state = reactive({
  title: props.recipe?.title || '',
  description: props.recipe?.description || '',
  imageUrl: props.recipe?.imageUrl || null,
  date: props.recipe?.date ? new Date(props.recipe.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  tags: props.recipe?.tags || [],
  source: props.recipe?.source || '',
  visibility: (props.recipe?.visibility as 'public' | 'private') || 'public',
  ingredients: [] as Array<{
    rowId: string
    amount: string
    unit: string
    ingredientName: string
    ingredientId?: string
    spoonacularIngredientId?: number
    spoonacularData?: any
    freeText?: string
    notes?: string
  }>,
  steps: Array.isArray(props.recipe?.steps)
    ? props.recipe.steps.map((step: { title?: string; content?: string }) => ({
        rowId: createRowId('step'),
        title: step.title || '',
        content: step.content || ''
      }))
    : []
})

// Load ingredients when component mounts or recipe changes
onMounted(async () => {
  state.ingredients = await loadRecipeIngredients()
  if (state.ingredients.length === 0) {
    state.ingredients = [createEmptyIngredient()]
  }

  if (state.steps.length === 0) {
    state.steps = [createEmptyStep()]
  }
})

const newTag = ref('')
const selectedFile = ref<any>(null)
const uploadingFile = ref(false)
const uploadError = ref<string | null>(null)
const extractionFile = ref<any>(null)
const extractionMethodFile = ref<any>(null)
const extractionApplyMode = ref<ExtractionApplyMode>(props.isEdit ? 'fill-empty' : 'replace-all')
const extractingRecipe = ref(false)
const extractionError = ref<string | null>(null)
const extractionSummary = ref<string | null>(null)
const hydratingPrefilledIngredients = ref(false)
const extractionPreviewUrl = ref<string | null>(null)
const extractionCompressionNote = ref<string | null>(null)
const extractionMethodCompressionNote = ref<string | null>(null)
const triRegionCrops = ref<{ title: Blob; ingredients: Blob; method: Blob } | null>(null)
const regionCropModalOpen = ref(false)
const uploadCompressionNote = ref<string | null>(null)
const isProcessingExtractionSelection = ref(false)
const submitting = computed(() => Boolean(props.submitting))
const hasExtractionFile = computed(() => {
  if (!extractionFile.value) {
    return false
  }
  const files = extractionFile.value instanceof FileList
    ? Array.from(extractionFile.value)
    : (Array.isArray(extractionFile.value) ? extractionFile.value : [extractionFile.value])
  return files.length > 0
})
const isSubmitDisabled = computed(() => {
  return uploadingFile.value || submitting.value || !state.title.trim() || !state.date
})
const extractionPreviewFile = computed(() => getFirstFile(extractionFile.value))
const extractionPreviewFileName = computed(() => extractionPreviewFile.value?.name || '')
const formatFileSize = (size: number) => {
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
const extractionPreviewFileSizeText = computed(() => {
  const size = extractionPreviewFile.value?.size
  return formatFileSize(size || 0)
})

const addTag = () => {
  const normalized = newTag.value.trim().replace(/\s+/g, ' ')
  const hasDuplicate = state.tags.some(tag => tag.toLowerCase() === normalized.toLowerCase())
  if (normalized && !hasDuplicate) {
    state.tags.push(normalized)
    newTag.value = ''
  }
}

const removeTag = (index: number) => {
  state.tags.splice(index, 1)
}

const addIngredient = () => {
  state.ingredients.push(createEmptyIngredient())
}

const removeIngredient = (index: number) => {
  if (state.ingredients.length <= 1) {
    state.ingredients[0] = createEmptyIngredient()
    return
  }
  state.ingredients.splice(index, 1)
}

const moveIngredient = (from: number, to: number) => {
  if (to < 0 || to >= state.ingredients.length || from === to) {
    return
  }
  const [item] = state.ingredients.splice(from, 1)
  if (!item) {
    return
  }
  state.ingredients.splice(to, 0, item)
}

const handleIngredientSelect = async (index: number, ingredient: { name: string; spoonacularIngredientId?: number; spoonacularData?: any }) => {
  const ing = state.ingredients[index]
  ing.ingredientName = ingredient.name
  
  // Create or find ingredient in database
  try {
    // Search for existing ingredient by name
    const existing = await $fetch<Array<{ id: string; name: string }>>(`/api/ingredients/search?q=${encodeURIComponent(ingredient.name)}`)
    
    if (existing && existing.length > 0) {
      ing.ingredientId = existing[0].id
      // Update with Spoonacular data if provided
      if (ingredient.spoonacularIngredientId) {
        await $fetch(`/api/ingredients/${existing[0].id}`, {
          // @ts-ignore - $fetch accepts PUT method
          method: 'PUT',
          body: {
            spoonacularIngredientId: ingredient.spoonacularIngredientId,
            spoonacularData: ingredient.spoonacularData
          }
        })
      }
    } else {
      // Create new ingredient
      const newIngredient = await $fetch<{ id: string }>('/api/ingredients', {
        method: 'POST',
        body: {
          name: ingredient.name,
          spoonacularIngredientId: ingredient.spoonacularIngredientId,
          spoonacularData: ingredient.spoonacularData
        }
      })
      ing.ingredientId = newIngredient.id
    }
    
    if (ingredient.spoonacularIngredientId) {
      ing.spoonacularIngredientId = ingredient.spoonacularIngredientId
      ing.spoonacularData = ingredient.spoonacularData
    }
  } catch (error) {
    console.error('Failed to save ingredient:', error)
  }
}

const addStep = () => {
  state.steps.push(createEmptyStep())
}

const removeStep = (index: number) => {
  if (state.steps.length <= 1) {
    state.steps[0] = createEmptyStep()
    return
  }
  state.steps.splice(index, 1)
}

const moveStep = (from: number, to: number) => {
  if (to < 0 || to >= state.steps.length || from === to) {
    return
  }
  const [item] = state.steps.splice(from, 1)
  if (!item) {
    return
  }
  state.steps.splice(to, 0, item)
}

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
    piece: 'pieces',
    pieces: 'pieces',
    clove: 'pieces',
    cloves: 'pieces'
  }
  return unitMap[normalized] || 'pieces'
}

const hasMeaningfulIngredients = () => {
  return state.ingredients.some(ingredient =>
    Boolean(ingredient.ingredientName.trim() || ingredient.amount.trim() || (ingredient.notes || '').trim())
  )
}

const hasMeaningfulSteps = () => {
  return state.steps.some(step => Boolean(step.title.trim() || step.content.trim()))
}

const toExtractedIngredients = (ingredients: ExtractedRecipeResponse['ingredients']) => {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return []
  }

  return ingredients
    .map((ingredient) => ({
      rowId: createRowId('ingredient'),
      amount: String(ingredient.amount || '').trim(),
      unit: normalizeUnit(String(ingredient.unit || 'pieces')),
      ingredientName: String(ingredient.ingredientName || '').trim(),
      notes: String(ingredient.notes || '').trim()
    }))
    .filter(ingredient => ingredient.ingredientName)
}

const toExtractedSteps = (steps: ExtractedRecipeResponse['steps']) => {
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

const mergeExtractedRecipe = (extracted: ExtractedRecipeResponse, mode: ExtractionApplyMode) => {
  if (mode === 'replace-all') {
    if (extracted.title) state.title = extracted.title.trim()
    if (extracted.description !== undefined) state.description = String(extracted.description || '').trim()
  } else {
    if (!state.title.trim() && extracted.title) state.title = extracted.title.trim()
    if (!state.description.trim() && extracted.description) state.description = extracted.description.trim()
  }

  if (Array.isArray(extracted.tags) && extracted.tags.length > 0) {
    const mergedTags = [...state.tags]
    for (const tag of extracted.tags) {
      const normalizedTag = String(tag || '').trim().replace(/\s+/g, ' ')
      if (!normalizedTag) continue
      if (!mergedTags.some(existing => existing.toLowerCase() === normalizedTag.toLowerCase())) {
        mergedTags.push(normalizedTag)
      }
    }
    state.tags = mergedTags
  }

  const extractedIngredients = toExtractedIngredients(extracted.ingredients)
  const extractedSteps = toExtractedSteps(extracted.steps)

  if (mode === 'replace-all') {
    state.ingredients = extractedIngredients.length > 0 ? extractedIngredients : [createEmptyIngredient()]
    state.steps = extractedSteps.length > 0 ? extractedSteps : [createEmptyStep()]
  } else {
    if (extractedIngredients.length > 0) {
      if (!hasMeaningfulIngredients()) {
        state.ingredients = extractedIngredients
      } else {
        state.ingredients = [...state.ingredients, ...extractedIngredients]
      }
    }
    if (extractedSteps.length > 0) {
      if (!hasMeaningfulSteps()) {
        state.steps = extractedSteps
      } else {
        state.steps = [...state.steps, ...extractedSteps]
      }
    }
  }

  if (state.ingredients.length === 0) {
    state.ingredients = [createEmptyIngredient()]
  }
  if (state.steps.length === 0) {
    state.steps = [createEmptyStep()]
  }
}

const persistIngredientForRow = async (index: number, ingredientName: string) => {
  const normalizedName = ingredientName.trim()
  if (!normalizedName) {
    return
  }

  const ing = state.ingredients[index]
  if (!ing) {
    return
  }

  // Do not overwrite rows that already have a linked ingredient.
  if (ing.ingredientId || ing.spoonacularIngredientId) {
    return
  }

  try {
    const existing = await $fetch<Array<{ id: string; name: string }>>(`/api/ingredients/search?q=${encodeURIComponent(normalizedName)}`)
    if (existing?.length) {
      ing.ingredientId = existing[0].id
      return
    }

    const created = await $fetch<{ id: string }>('/api/ingredients', {
      method: 'POST',
      body: {
        name: normalizedName
      }
    })

    ing.ingredientId = created.id
  } catch (error) {
    console.error('Failed to persist extracted ingredient:', error)
  }
}

const hydrateExtractedIngredients = async () => {
  const tasks = state.ingredients
    .map((ingredient, index) => ({ index, name: ingredient.ingredientName }))
    .filter(item => item.name.trim())

  if (tasks.length === 0) {
    return
  }

  hydratingPrefilledIngredients.value = true
  try {
    for (const task of tasks) {
      await persistIngredientForRow(task.index, task.name)
    }
  } finally {
    hydratingPrefilledIngredients.value = false
  }
}

const getFirstFile = (files: unknown) => {
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

const inferMimeTypeFromName = (name?: string) => {
  const lowerName = (name || '').toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.gif')) return 'image/gif'
  if (lowerName.endsWith('.heic')) return 'image/heic'
  if (lowerName.endsWith('.heif')) return 'image/heif'
  return ''
}

const isHeicLike = (file: File) => {
  const lowerType = (file.type || '').toLowerCase()
  const lowerName = (file.name || '').toLowerCase()
  return lowerType === 'image/heic'
    || lowerType === 'image/heif'
    || HEIC_EXTENSIONS.some(ext => lowerName.endsWith(ext))
}

const isSupportedExtractionImage = (mimeType: string) => {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
}

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

const extractAndPrefill = async () => {
  extractionError.value = null
  extractionSummary.value = null

  const file = getFirstFile(extractionFile.value)
  if (!(file instanceof File)) {
    extractionError.value = 'Please select an image to scan.'
    return
  }

  if (isHeicLike(file)) {
    extractionError.value = 'HEIC/HEIF photos are not supported yet. On iPhone, switch Camera > Formats to "Most Compatible" or convert to JPG/PNG before scanning.'
    return
  }

  const regions = triRegionCrops.value
  if (regions) {
    for (const blob of [regions.title, regions.ingredients, regions.method]) {
      if (blob.size > MAX_EXTRACTION_FILE_SIZE_BYTES) {
        extractionError.value = 'One cropped region is too large (max 8MB per image). Tighten the crop and try again.'
        return
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
    return
  }

  if (!regions && uploadFile.size > MAX_EXTRACTION_FILE_SIZE_BYTES) {
    extractionError.value = 'Image is too large for AI scan (max 8MB). Please crop/resize and try again.'
    return
  }

  extractingRecipe.value = true

  try {
    if (regions) {
      const extracted = await runExtractionTriRegion(regions)
      mergeExtractedRecipe(extracted, extractionApplyMode.value)
      void hydrateExtractedIngredients()
      const ingCount = Array.isArray(extracted.ingredients) ? extracted.ingredients.length : 0
      const stepCount = Array.isArray(extracted.steps) ? extracted.steps.length : 0
      extractionSummary.value = `Prefill complete (three-region scan): ${ingCount} ingredients and ${stepCount} steps extracted.`
      triRegionCrops.value = null
      extractionFile.value = null
      extractionMethodFile.value = null
      extractionCompressionNote.value = null
      extractionMethodCompressionNote.value = null
      return
    }

    const extracted = await runExtractionForFile(uploadFile)
    mergeExtractedRecipe(extracted, extractionApplyMode.value)

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
      mergeExtractedRecipe(methodExtracted, 'fill-empty')
      methodExtractedIngredientCount = Array.isArray(methodExtracted.ingredients) ? methodExtracted.ingredients.length : 0
      methodExtractedStepCount = Array.isArray(methodExtracted.steps) ? methodExtracted.steps.length : 0
    }

    void hydrateExtractedIngredients()

    const extractedIngredientCount = Array.isArray(extracted.ingredients) ? extracted.ingredients.length : 0
    const extractedStepCount = Array.isArray(extracted.steps) ? extracted.steps.length : 0
    const totalIngredients = extractedIngredientCount + methodExtractedIngredientCount
    const totalSteps = extractedStepCount + methodExtractedStepCount

    extractionSummary.value = `Prefill complete: ${totalIngredients} ingredients and ${totalSteps} steps extracted.`
    extractionFile.value = null
    extractionMethodFile.value = null
    extractionCompressionNote.value = null
    extractionMethodCompressionNote.value = null
  } catch (error: any) {
    const detailMessage = typeof error?.data?.detail === 'string' ? error.data.detail : ''
    const rawMessage = detailMessage || error?.data?.statusMessage || error?.statusMessage || error?.message || ''
    if (rawMessage.includes('NotReadableError') || rawMessage.includes('The requested file could not be read')) {
      extractionError.value = 'We could not read that image file. Please re-select it (or save it locally) and try again.'
    } else if (rawMessage.includes('AI binding not available') || rawMessage.includes('AI Gateway ID not configured')) {
      extractionError.value = 'AI scanning is not configured in this environment yet. Add the Cloudflare AI env vars, then retry.'
    } else if (rawMessage.includes('rate limit exceeded')) {
      extractionError.value = 'AI scanning is temporarily rate-limited. Please wait a moment and try again.'
    } else if (rawMessage.includes('quota exceeded')) {
      extractionError.value = 'AI scanning quota is exhausted. Please check your Cloudflare plan and limits.'
    } else if (rawMessage.includes('No extractable recipe content found')) {
      extractionError.value = 'We could not confidently read this recipe page. Try two tighter crops: one for ingredients and one for method, with flat framing and even lighting.'
    } else {
      extractionError.value = rawMessage || 'Unable to extract recipe from image.'
    }
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

// Watch for file selection changes and upload automatically
watch(selectedFile, async (files) => {
  if (!files) {
    return
  }

  const file = getFirstFile(files)
  if (!(file instanceof File)) {
    uploadError.value = 'Unable to read that photo. Please select the image again.'
    selectedFile.value = null
    return
  }
  uploadError.value = null
  uploadingFile.value = true

  try {
    const uploadFile = await compressImageForUpload(file, {
      compressIfLargerThan: COMPRESS_IF_LARGER_THAN,
      maxDimension: UPLOAD_MAX_DIMENSION,
      jpegQuality: UPLOAD_JPEG_QUALITY
    })
    if (uploadFile !== file) {
      uploadCompressionNote.value = `Image optimised for upload (${formatFileSize(file.size)} -> ${formatFileSize(uploadFile.size)}).`
    } else {
      uploadCompressionNote.value = null
    }

    const formData = new FormData()
    formData.append('image', uploadFile)

    const result = await $fetch<{ url: string; path: string }>('/api/recipes/upload', {
      method: 'POST',
      body: formData
    })

    state.imageUrl = result.url
    selectedFile.value = null // Clear the file selection after successful upload
  } catch (err: any) {
    uploadError.value = err.message || 'Failed to upload image'
    selectedFile.value = null
  } finally {
    uploadingFile.value = false
  }
})

const clearImage = () => {
  state.imageUrl = null
  selectedFile.value = null
  uploadError.value = null
  uploadCompressionNote.value = null
}

const onSubmit = async (event: any) => {
  if (uploadingFile.value || submitting.value) {
    return
  }

  const formData = event.data || event
  const ingredientsForSubmit = state.ingredients.map(({ rowId, ...ingredient }) => ingredient)
  const stepsForSubmit = state.steps.map(({ rowId, ...step }) => step)
  const submitData = {
    ...formData,
    imageUrl: state.imageUrl,
    visibility: state.visibility,
    tags: state.tags,
    ingredients: ingredientsForSubmit,
    steps: stepsForSubmit
  }
  emit('submit', submitData)
}
</script>
