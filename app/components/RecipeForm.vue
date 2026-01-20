<template>
  <UForm
    :state="state"
    :schema="schema"
    @submit="onSubmit"
    class="space-y-6"
  >
    <UFormField label="Title" name="title" required>
      <UInput v-model="state.title" />
    </UFormField>

    <UFormField label="Description" name="description">
      <UTextarea v-model="state.description" :rows="4" />
    </UFormField>

    <UFormField label="Image" name="imageUrl">
      <div class="space-y-4">
        <!-- Show existing image if available -->
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
            icon="i-heroicons-x-mark"
            color="error"
            variant="solid"
            class="absolute top-2 right-2"
            @click="clearImage"
          />
        </div>
        
        <!-- File upload component -->
        <UFileUpload
          v-model="selectedFile"
          accept="image/*"
          :label="state.imageUrl ? 'Replace image' : 'Upload image'"
          description="JPG, PNG, WEBP or GIF (max. 4MB)"
        />
        
        <!-- Upload status -->
        <div v-if="uploadingFile" class="flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
          <span>Uploading...</span>
        </div>
        
        <UAlert
          v-if="uploadError"
          color="error"
          variant="soft"
          :title="uploadError"
        />
      </div>
    </UFormField>

    <UFormField label="Date" name="date" required>
      <UInput v-model="state.date" type="date" />
    </UFormField>

    <UFormField label="Tags" name="tags">
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="(tag, index) in state.tags"
          :key="index"
          color="primary"
          class="cursor-pointer"
          @click="removeTag(Number(index))"
        >
          {{ tag }}
          <UIcon name="i-heroicons-x-mark" class="ml-1" />
        </UBadge>
        <UInput
          v-model="newTag"
          placeholder="Add tag"
          @keyup.enter="addTag"
          class="w-32"
        />
      </div>
    </UFormField>

    <UFormField label="Source URL" name="source">
      <UInput v-model="state.source" type="url" />
    </UFormField>

    <UFormField label="Ingredients" name="ingredients">
      <div class="space-y-4">
        <div
          v-for="(ingredient, index) in state.ingredients"
          :key="index"
          class="border rounded-lg p-4 space-y-2"
        >
          <div class="grid grid-cols-12 gap-2">
            <div class="col-span-3">
              <UInput
                v-model="ingredient.amount"
                placeholder="Amount"
                type="number"
                step="0.1"
              />
            </div>
            <div class="col-span-3">
              <USelect
                v-model="ingredient.unit"
                :items="unitOptions"
                class="w-full"
                placeholder="Unit"
              />
            </div>
            <div class="col-span-5">
              <IngredientSelector
                v-model="ingredient.ingredientName"
                @select="handleIngredientSelect(index, $event)"
              />
            </div>
            <div class="col-span-1">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="ghost"
                @click="removeIngredient(Number(index))"
              />
            </div>
          </div>
          <UInput
            v-if="ingredient.notes !== undefined"
            v-model="ingredient.notes"
            placeholder="Notes (optional, e.g., chopped, diced)"
            size="sm"
          />
        </div>
        <UButton
          icon="i-heroicons-plus"
          variant="outline"
          @click="addIngredient"
        >
          Add Ingredient
        </UButton>
      </div>
    </UFormField>

    <UFormField label="Steps" name="steps">
      <div class="space-y-4">
        <div
          v-for="(step, index) in state.steps"
          :key="index"
          class="border rounded-lg p-4 space-y-2"
        >
          <UFormField :name="`steps.${index}.title`">
            <UInput
              v-model="state.steps[index].title"
              placeholder="Step title"
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
          <UButton
            icon="i-heroicons-trash"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeStep(Number(index))"
          >
            Remove Step
          </UButton>
        </div>
        <UButton
          icon="i-heroicons-plus"
          variant="outline"
          @click="addStep"
        >
          Add Step
        </UButton>
      </div>
    </UFormField>

    <div class="flex gap-4">
      <UButton type="submit" :loading="loading">
        {{ isEdit ? 'Update Recipe' : 'Create Recipe' }}
      </UButton>
      <UButton
        variant="outline"
        @click="$emit('cancel')"
      >
        Cancel
      </UButton>
    </div>
  </UForm>
</template>

<script setup lang="ts">
import { z } from 'zod'

const props = defineProps<{
  recipe?: any
  isEdit?: boolean
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
  ingredients: [] as Array<{
    amount: string
    unit: string
    ingredientName: string
    ingredientId?: string
    spoonacularIngredientId?: number
    spoonacularData?: any
    freeText?: string
    notes?: string
  }>,
  steps: props.recipe?.steps || []
})

// Load ingredients when component mounts or recipe changes
onMounted(async () => {
  state.ingredients = await loadRecipeIngredients()
  if (state.ingredients.length === 0) {
    state.ingredients = [{ amount: '', unit: 'cups', ingredientName: '', notes: '' }]
  }
})

const newTag = ref('')
const loading = ref(false)
const selectedFile = ref<any>(null)
const uploadingFile = ref(false)
const uploadError = ref<string | null>(null)

const addTag = () => {
  if (newTag.value.trim() && !state.tags.includes(newTag.value.trim())) {
    state.tags.push(newTag.value.trim())
    newTag.value = ''
  }
}

const removeTag = (index: number) => {
  state.tags.splice(index, 1)
}

const addIngredient = () => {
  state.ingredients.push({ amount: '', unit: 'cups', ingredientName: '', notes: '' })
}

const removeIngredient = (index: number) => {
  state.ingredients.splice(index, 1)
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
  state.steps.push({ title: '', content: '' })
}

const removeStep = (index: number) => {
  state.steps.splice(index, 1)
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
  loading.value = true
  try {
    // UForm's submit event passes { data, valid, errors }
    // Extract just the data to keep the API clean
    const formData = event.data || event
    // Ensure imageUrl is included from state (UForm might filter it out if null)
    const submitData = {
      ...formData,
      imageUrl: state.imageUrl,
      ingredients: state.ingredients // Include structured ingredients
    }
    emit('submit', submitData)
  } finally {
    loading.value = false
  }
}
</script>
