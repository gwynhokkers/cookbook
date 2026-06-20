<template>
  <UPage>
    <UPageBody>
      <UPageSection
        title="Edit Recipe"
        description="Update your recipe"
        class="mx-auto w-full max-w-5xl"
      >
        <div v-if="pending">
          <div class="text-center py-8">
            <p>Loading recipe...</p>
          </div>
        </div>
        <div v-else-if="error">
          <UAlert
            color="error"
            title="Error"
            :description="error.message || 'Failed to load recipe'"
          />
        </div>
        <RecipeForm
          v-else-if="recipe"
          :recipe="recipe"
          :is-edit="true"
          :submitting="submitting"
          @submit="handleSubmit"
          @cancel="handleCancel"
        />
      </UPageSection>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'editor',
  layout: 'recipes'
})
const { seo } = useAppConfig()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const submitting = ref(false)

// Get the recipe ID from route params
const recipeId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id

const { data: recipe, pending, error } = await useFetch(`/api/recipes/${recipeId}`, {
  credentials: 'include'
})

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode || 404,
    statusMessage: error.value.statusMessage || 'Recipe not found'
  })
}

const handleSubmit = async (data: any) => {
  submitting.value = true
  try {
    // Extract ingredients from data
    const ingredients = data.ingredients || []
    delete data.ingredients

    const validIngredients = selectValidIngredients(ingredients)
    await enrichIngredientsViaParse(validIngredients)

    // Update recipe
    await $fetch(`/api/recipes/${recipeId}`, {
      method: 'PUT',
      body: data,
      credentials: 'include'
    })

    await syncRecipeIngredients(recipeId as string, validIngredients)

    toast.add({
      title: 'Recipe updated',
      description: 'Your changes were saved successfully.'
    })

    await navigateTo(`/recipes/${recipeId}`)
  } catch (error: any) {
    console.error('Failed to update recipe:', error)
    toast.add({
      color: 'error',
      title: 'Unable to update recipe',
      description: error?.data?.statusMessage || error?.message || 'Please try again in a moment.'
    })
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  router.back()
}

useSeoMeta({
  title: `Edit | ${recipe.value?.title} | ${seo?.siteName}`,
  ogTitle: `Edit | ${recipe.value?.title} | ${seo?.siteName}`,
  description: `Edit ${recipe.value?.title} recipe`,
  ogDescription: `Edit | ${recipe.value?.title} | ${seo?.siteName}`
})

defineOgImage({
  component: 'Recipe',
  title: `Edit ${recipe.value?.title}`,
  description: `Edit ${recipe.value?.title} recipe`
})
</script>
