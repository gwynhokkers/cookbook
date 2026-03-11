<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Create New Recipe"
      description="Add a new recipe to your cookbook"
    />

    <UPageBody>
      <RecipeForm
        :submitting="submitting"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
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
    
    // Create recipe first
    const recipe = await $fetch('/api/recipes', {
      method: 'POST',
      body: data
    })
    
    // Process structured ingredients
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
      
      // Create recipe_ingredient link
      await $fetch(`/api/recipes/${recipe.id}/ingredients`, {
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
      
      // Create recipe_ingredient link
      await $fetch(`/api/recipes/${recipe.id}/ingredients`, {
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
    
    toast.add({
      title: 'Recipe created',
      description: `"${recipe.title}" was added successfully.`
    })

    await navigateTo(`/recipes/${recipe.id}`)
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
