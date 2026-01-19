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
      <ImageUpload v-model="state.imageUrl" />
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
      <div class="space-y-2">
        <div
          v-for="(ingredient, index) in state.ingredients"
          :key="index"
          class="flex gap-2"
        >
          <UInput
            v-model="state.ingredients[index]"
            placeholder="Ingredient"
          />
          <UButton
            icon="i-heroicons-trash"
            color="error"
            variant="ghost"
            @click="removeIngredient(Number(index))"
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
            />
          </UFormField>
          <UFormField :name="`steps.${index}.content`">
            <UTextarea
              v-model="state.steps[index].content"
              placeholder="Step instructions"
              :rows="3"
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
  ingredients: z.array(z.string()).default([]),
  steps: z.array(z.object({
    title: z.string(),
    content: z.string()
  })).default([])
})

const state = reactive({
  title: props.recipe?.title || '',
  description: props.recipe?.description || '',
  imageUrl: props.recipe?.imageUrl || null,
  date: props.recipe?.date ? new Date(props.recipe.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
  tags: props.recipe?.tags || [],
  source: props.recipe?.source || '',
  ingredients: props.recipe?.ingredients || [],
  steps: props.recipe?.steps || []
})

const newTag = ref('')
const loading = ref(false)

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
  state.ingredients.push('')
}

const removeIngredient = (index: number) => {
  state.ingredients.splice(index, 1)
}

const addStep = () => {
  state.steps.push({ title: '', content: '' })
}

const removeStep = (index: number) => {
  state.steps.splice(index, 1)
}

const onSubmit = async (data: any) => {
  loading.value = true
  try {
    emit('submit', data)
  } finally {
    loading.value = false
  }
}
</script>
