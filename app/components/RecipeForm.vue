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
          <UFileUpload
            v-model="extractionFile"
            accept="image/*"
            label="Choose cookbook photo or scan"
            description="Best results: one clear recipe per image."
          />
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
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <UButton
          type="button"
          icon="i-heroicons-sparkles"
          :loading="extractingRecipe"
          :disabled="!hasExtractionFile || extractingRecipe || submitting || uploadingFile"
          @click="extractAndPrefill"
        >
          Scan and prefill
        </UButton>
        <UButton
          type="button"
          variant="outline"
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

        <UFormField label="Source URL" name="source" class="md:col-span-2">
          <UInput v-model="state.source" type="url" placeholder="https://example.com/original-recipe" />
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

          <UFileUpload
            v-model="selectedFile"
            accept="image/*"
            :label="state.imageUrl ? 'Replace image' : 'Upload image'"
            description="JPG, PNG, WEBP or GIF (max. 4MB)"
          />

          <div v-if="uploadingFile" class="flex items-center gap-2 text-sm">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
            <span>Uploading image...</span>
          </div>

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
              <UBadge color="neutral" variant="subtle">Step {{ index + 1 }}</UBadge>
              <div class="flex items-center gap-1">
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-up"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === 0"
                  @click="moveStep(index, index - 1)"
                />
                <UButton
                  type="button"
                  icon="i-heroicons-arrow-down"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="index === state.steps.length - 1"
                  @click="moveStep(index, index + 1)"
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

    <div class="sticky bottom-4 z-10">
      <div class="rounded-xl border border-default bg-default/95 backdrop-blur-sm p-3 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ isEdit ? 'Review changes and save when ready.' : 'Ready to publish your recipe?' }}
        </p>
        <div class="flex items-center gap-3">
          <UButton
            type="button"
            variant="outline"
            :disabled="submitting"
            @click="$emit('cancel')"
          >
            Cancel
          </UButton>
          <UButton type="submit" :loading="submitting" :disabled="isSubmitDisabled">
            {{ isEdit ? 'Update Recipe' : 'Create Recipe' }}
          </UButton>
        </div>
      </div>
    </div>
  </UForm>
</template>

<script setup lang="ts">
import { z } from 'zod'

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
  source: z.string().url().optional().or(z.literal('')),
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
const extractionApplyMode = ref<ExtractionApplyMode>(props.isEdit ? 'fill-empty' : 'replace-all')
const extractingRecipe = ref(false)
const extractionError = ref<string | null>(null)
const extractionSummary = ref<string | null>(null)
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

  return steps
    .map((step, index) => ({
      rowId: createRowId('step'),
      title: String(step.title || `Step ${index + 1}`).trim(),
      content: String(step.content || '').trim()
    }))
    .filter(step => step.content)
}

const mergeExtractedRecipe = (extracted: ExtractedRecipeResponse, mode: ExtractionApplyMode) => {
  if (mode === 'replace-all') {
    if (extracted.title) state.title = extracted.title.trim()
    if (extracted.description !== undefined) state.description = String(extracted.description || '').trim()
    if (extracted.source !== undefined) state.source = String(extracted.source || '').trim()
  } else {
    if (!state.title.trim() && extracted.title) state.title = extracted.title.trim()
    if (!state.description.trim() && extracted.description) state.description = extracted.description.trim()
    if (!state.source.trim() && extracted.source) state.source = extracted.source.trim()
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

const materializeExtractionFile = async (file: File) => {
  const bytes = await file.arrayBuffer()
  const inferredType = file.type || inferMimeTypeFromName(file.name) || 'application/octet-stream'
  return new File([bytes], file.name || 'scan-image', {
    type: inferredType,
    lastModified: Date.now()
  })
}

const clearExtractionFile = () => {
  extractionFile.value = null
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

  if (file.size <= 0) {
    extractionError.value = 'This image appears empty. Please re-select the photo and try again.'
    return
  }

  if (file.size > MAX_EXTRACTION_FILE_SIZE_BYTES) {
    extractionError.value = 'Image is too large for AI scan (max 8MB). Please crop/resize and try again.'
    return
  }

  extractingRecipe.value = true

  try {
    const stableFile = await materializeExtractionFile(file)
    const effectiveType = (stableFile.type || inferMimeTypeFromName(stableFile.name) || '').toLowerCase()

    if (!isSupportedExtractionImage(effectiveType)) {
      extractionError.value = 'Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.'
      return
    }

    const requestBody = new FormData()
    requestBody.append('image', stableFile)

    const extracted = await $fetch<ExtractedRecipeResponse>('/api/recipes/extract', {
      method: 'POST',
      body: requestBody
    })

    mergeExtractedRecipe(extracted, extractionApplyMode.value)

    const extractedIngredientCount = Array.isArray(extracted.ingredients) ? extracted.ingredients.length : 0
    const extractedStepCount = Array.isArray(extracted.steps) ? extracted.steps.length : 0
    extractionSummary.value = `Prefill complete: ${extractedIngredientCount} ingredients and ${extractedStepCount} steps extracted.`
    extractionFile.value = null
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
    } else {
      extractionError.value = rawMessage || 'Unable to extract recipe from image.'
    }
  } finally {
    extractingRecipe.value = false
  }
}

// Watch for file selection changes and upload automatically
watch(selectedFile, async (files) => {
  if (!files) {
    return
  }

  // Handle both FileList and File[] types
  const fileArray = files instanceof FileList ? Array.from(files) : (Array.isArray(files) ? files : [files])
  if (fileArray.length === 0) {
    return
  }

  const file = fileArray[0]
  uploadError.value = null
  uploadingFile.value = true

  try {
    const formData = new FormData()
    formData.append('image', file)

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
