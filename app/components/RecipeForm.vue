<template>
  <UForm
    :state="state"
    :schema="schema"
    @submit="onSubmit"
    class="space-y-8"
  >
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
const submitting = computed(() => Boolean(props.submitting))
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
