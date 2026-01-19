<template>
  <UPage class="container mx-auto flex-col flex gap-4 py-8 px-4">
    <template #left>
      <UPageAside>
        <div class="">
          <UContentToc
            title="On this page"
            :links="links"
            highlight
            highlight-color="neutral"
            color="neutral"
          />
        </div>
        <UContentNavigation :navigation="navigation" />
      </UPageAside>
    </template>
    <div class="flex justify-between items-start mb-4">
      <h1 class="text-4xl font-serif text-pretty mb-4">
        {{ recipe?.title }}
      </h1>
      <div v-if="loggedIn && recipe" class="flex gap-2">
        <UButton
          icon="i-heroicons-pencil"
          variant="ghost"
          :to="`/recipes/${recipe.id}/edit`"
        >
          Edit
        </UButton>
        <UButton
          icon="i-heroicons-trash"
          variant="ghost"
          color="red"
          @click="handleDelete"
        >
          Delete
        </UButton>
      </div>
    </div>
    <div class="mb-4">
      <NuxtPicture
        v-if="recipe?.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        :img-attrs="{ class: 'w-full rounded-lg overflow-hidden mb-4' }"
        width="800"
        height="600"
      />
      <div class="flex justify-between">
        <div class="flex gap-2 mb-2">
          <UBadge
            v-for="(item, index) in recipe?.tags || []"
            :key="index"
            color="primary"
            class="rounded-full"
          >
            {{ item }}
          </UBadge>
        </div>
        <div class="">
          <UButton
            v-if="recipe?.source"
            icon="i-lucide-link"
            variant="ghost"
            :to="recipe.source"
            target="_blank"
          />
        </div>
      </div>
    </div>
    <USeparator />
    <UPageBody>
      <div v-if="recipe?.description" class="mb-8 max-w-4xl prose">
        <p>{{ recipe.description }}</p>
      </div>

      <RecipeIngredientList v-if="recipe?.ingredients && recipe.ingredients.length > 0">
        <ul class="list-disc list-inside space-y-2">
          <li v-for="(ingredient, index) in recipe.ingredients" :key="index">
            {{ ingredient }}
          </li>
        </ul>
      </RecipeIngredientList>

      <div v-if="recipe?.steps && recipe.steps.length > 0" class="space-y-6 mt-8">
        <RecipeStep
          v-for="(step, index) in recipe.steps"
          :key="index"
          :title="step.title"
        >
          <div class="prose max-w-none">
            <p>{{ step.content }}</p>
          </div>
        </RecipeStep>
      </div>

      <USeparator class="mt-8" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import type { ContentTocLink } from '@nuxt/ui/runtime/components/content/ContentToc.vue'

const { seo } = useAppConfig()
const route = useRoute()
const router = useRouter()
const { loggedIn, user } = useUserSession()

definePageMeta({
  layout: 'recipes'
})

const { data: recipe, pending, error } = await useFetch(`/api/recipes/${route.params.id}`)

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Recipe not found'
  })
}

// Get navigation from all recipes
const { data: allRecipes } = await useFetch('/api/recipes')
const navigation = computed(() => {
  if (!allRecipes.value) return []
  return allRecipes.value.map((r: any) => ({
    title: r.title,
    to: `/recipes/${r.id}`
  }))
})

const links = computed(() => {
  const result: ContentTocLink[] = []
  
  if (recipe.value?.ingredients && recipe.value.ingredients.length > 0) {
    result.push({
      id: 'ingredients',
      depth: 1,
      text: 'Ingredients'
    })
  }

  if (recipe.value?.steps && recipe.value.steps.length > 0) {
    result.push({
      id: 'steps',
      depth: 2,
      text: 'Steps',
      children: recipe.value.steps.map((step: any, index: number) => ({
        id: step.title.toLowerCase().replace(/\s/g, '-') || `step-${index}`,
        depth: 3,
        text: step.title || `Step ${index + 1}`
      }))
    })
  }

  return result
})

const handleDelete = async () => {
  if (!confirm('Are you sure you want to delete this recipe?')) {
    return
  }

  try {
    await $fetch(`/api/recipes/${route.params.id}`, {
      method: 'DELETE'
    })
    await router.push('/')
  } catch (error: any) {
    console.error('Failed to delete recipe:', error)
    // TODO: Show error notification
  }
}

useSeoMeta({
  title: recipe.value?.title,
  ogTitle: `${recipe.value?.title} - ${seo?.siteName}`,
  description: recipe.value?.description,
  ogDescription: recipe.value?.description
})

defineOgImage({
  component: 'Recipe',
  title: recipe.value?.title,
  description: recipe.value?.description
})
</script>
