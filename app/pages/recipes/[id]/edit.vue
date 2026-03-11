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
    
    // Check if we have any free-text ingredients to parse
    const freeTextIngredients = ingredients.filter((ing: any) => ing.freeText && !ing.ingredientName)
    const structuredIngredients = ingredients.filter((ing: any) => ing.ingredientName && ing.amount && ing.unit)
    
    // Parse free-text ingredients using Spoonacular Parse Ingredients endpoint
    let parsedIngredients: any[] = []
    if (freeTextIngredients.length > 0) {
      try {
        const freeTextStrings = freeTextIngredients.map((ing: any) => ing.freeText)
        parsedIngredients = await $fetch('/api/spoonacular/ingredients/parse', {
          method: 'POST',
          body: { ingredients: freeTextStrings }
        })
      } catch (error) {
        console.error('Failed to parse ingredients:', error)
        // Continue with structured ingredients only
      }
    }
    
    // Update recipe
    await $fetch(`/api/recipes/${recipeId}`, {
      method: 'PUT',
      body: data,
      credentials: 'include'
    })
    
    // Get existing recipe ingredients
    const existingIngredients = await $fetch(`/api/recipes/${recipeId}/ingredients`).catch(() => [])
    const existingIds = new Set(existingIngredients.map((ri: any) => ri.id))
    
    // Update/create/delete structured ingredients
    for (let i = 0; i < structuredIngredients.length; i++) {
      const ing = structuredIngredients[i]
      if (!ing.ingredientName || !ing.amount || !ing.unit) continue
      
      // Ensure ingredient exists
      let ingredientId = ing.ingredientId
      if (!ingredientId) {
        const ingredient = await $fetch('/api/ingredients', {
          method: 'POST',
          body: {
            name: ing.ingredientName,
            spoonacularIngredientId: ing.spoonacularIngredientId,
            spoonacularData: ing.spoonacularData
          }
        })
        ingredientId = ingredient.id
      }
      
      // Find existing recipe_ingredient for this ingredient
      const existing = existingIngredients.find((ri: any) => ri.ingredientId === ingredientId)
      
      if (existing) {
        // Update existing
        await $fetch(`/api/recipes/${recipeId}/ingredients/${existing.id}`, {
          method: 'PUT',
          body: {
            amount: ing.amount,
            unit: ing.unit,
            notes: ing.notes || null,
            order: i
          }
        })
        existingIds.delete(existing.id)
      } else {
        // Create new
        await $fetch(`/api/recipes/${recipeId}/ingredients`, {
          method: 'POST',
          body: {
            ingredientId,
            amount: ing.amount,
            unit: ing.unit,
            notes: ing.notes || null,
            order: i
          }
        })
      }
    }
    
    // Process parsed free-text ingredients
    for (let i = 0; i < parsedIngredients.length; i++) {
      const parsed = parsedIngredients[i]
      if (!parsed.name || !parsed.amount || !parsed.unit) continue
      
      // Ensure ingredient exists
      let ingredientId: string | undefined
      const existing = await $fetch<Array<{ id: string; name: string }>>(`/api/ingredients/search?q=${encodeURIComponent(parsed.name)}`).catch(() => [])
      
      if (existing && existing.length > 0) {
        ingredientId = existing[0].id
        // Update with Spoonacular data
        await $fetch(`/api/ingredients/${ingredientId}`, {
          // @ts-ignore - $fetch accepts PUT method
          method: 'PUT',
          body: {
            spoonacularIngredientId: parsed.id,
            spoonacularData: parsed
          }
        })
      } else {
        const ingredient = await $fetch<{ id: string }>('/api/ingredients', {
          method: 'POST',
          body: {
            name: parsed.name,
            spoonacularIngredientId: parsed.id,
            spoonacularData: parsed
          }
        })
        ingredientId = ingredient.id
      }
      
      // Find existing recipe_ingredient for this ingredient
      const existingRI = existingIngredients.find((ri: any) => ri.ingredientId === ingredientId)
      
      if (existingRI) {
        // Update existing
        await $fetch(`/api/recipes/${recipeId}/ingredients/${existingRI.id}`, {
          method: 'PUT',
          body: {
            amount: String(parsed.amount),
            unit: parsed.unitShort || parsed.unit,
            notes: parsed.meta?.join(', ') || null,
            order: structuredIngredients.length + i
          }
        })
        existingIds.delete(existingRI.id)
      } else {
        // Create new
        await $fetch(`/api/recipes/${recipeId}/ingredients`, {
          method: 'POST',
          body: {
            ingredientId,
            amount: String(parsed.amount),
            unit: parsed.unitShort || parsed.unit,
            notes: parsed.meta?.join(', ') || null,
            order: structuredIngredients.length + i
          }
        })
      }
    }
    
    // Delete removed ingredients
    for (const id of existingIds) {
      await $fetch(`/api/recipes/${recipeId}/ingredients/${id}`, {
        method: 'DELETE'
      })
    }
    
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
