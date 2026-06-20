<template>
  <UPage>
    <UPageBody>
      <UPageSection
        title="Create New Recipe"
        description="Add a new recipe to your cookbook"
        class="mx-auto w-full max-w-5xl"
      >
        <RecipeForm
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
  middleware: 'editor'
})

const router = useRouter()
const toast = useToast()
const submitting = ref(false)

// Avoid focusing the first form input (e.g. ingredient) on initial navigation
onMounted(() => {
  nextTick(() => {
    const el = document.activeElement as HTMLElement | null
    if (el?.blur) {
      el.blur()
    }
    window.scrollTo(0, 0)
  })
})

const handleSubmit = async (data: any) => {
  submitting.value = true
  try {
    // Extract ingredients from data
    const ingredients = data.ingredients || []
    delete data.ingredients

    const validIngredients = selectValidIngredients(ingredients)
    await enrichIngredientsViaParse(validIngredients)

    // Create recipe first
    const recipe = await $fetch('/api/recipes', {
      method: 'POST',
      body: data
    })

    await linkIngredients(recipe.id, validIngredients)

    toast.add({
      title: 'Recipe created',
      description: `"${recipe.title}" was added successfully.`
    })

    if (recipe?.id) {
      return await navigateTo(`/recipes/${recipe.id}`, { replace: true })
    }
  } catch (error: any) {
    console.error('Failed to create recipe:', error)
    toast.add({
      color: 'error',
      title: 'Unable to create recipe',
      description: error?.data?.statusMessage || error?.message || 'Please check the form and try again.'
    })
  } finally {
    submitting.value = false
  }
}

const handleCancel = () => {
  router.back()
}
</script>
