<template>
  <div v-if="nutrition" class="space-y-4">
    <h2 class="text-2xl font-serif mb-4">Nutrition Information</h2>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Total Nutrition -->
      <div class="border rounded-lg p-4">
        <h3 class="font-semibold mb-3">Total ({{ nutrition.servings }} serving{{ nutrition.servings !== 1 ? 's' : '' }})</h3>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Energy:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.energyKcal) }} kcal</span>
          </div>
          <div class="flex justify-between">
            <span>Protein:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.proteins * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Carbohydrates:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.carbohydrates * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Fat:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.fat * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Fiber:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.fiber * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Sugars:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.sugars * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Salt:</span>
            <span class="font-semibold">{{ Math.round(nutrition.total.salt * 10) / 10 }}g</span>
          </div>
        </div>
      </div>
      
      <!-- Per Serving -->
      <div class="border rounded-lg p-4">
        <h3 class="font-semibold mb-3">Per Serving</h3>
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>Energy:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.energyKcal) }} kcal</span>
          </div>
          <div class="flex justify-between">
            <span>Protein:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.proteins * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Carbohydrates:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.carbohydrates * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Fat:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.fat * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Fiber:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.fiber * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Sugars:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.sugars * 10) / 10 }}g</span>
          </div>
          <div class="flex justify-between">
            <span>Salt:</span>
            <span class="font-semibold">{{ Math.round(nutrition.perServing.salt * 10) / 10 }}g</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Ingredient breakdown -->
    <div v-if="nutrition.ingredients.length > 0" class="mt-4">
      <h3 class="font-semibold mb-2">By Ingredient</h3>
      <div class="space-y-2">
        <div
          v-for="ing in nutrition.ingredients"
          :key="ing.ingredientId"
          class="text-sm border-b pb-2"
        >
          <div class="font-medium">{{ ing.ingredientName }} ({{ ing.amount }}{{ ing.unit }})</div>
          <div class="text-gray-600 dark:text-gray-400">
            {{ Math.round(ing.nutrition.energyKcal) }} kcal,
            {{ Math.round(ing.nutrition.proteins * 10) / 10 }}g protein,
            {{ Math.round(ing.nutrition.carbohydrates * 10) / 10 }}g carbs,
            {{ Math.round(ing.nutrition.fat * 10) / 10 }}g fat
          </div>
        </div>
      </div>
    </div>
    
    <UAlert
      v-if="hasMissingData"
      color="warning"
      variant="soft"
      title="Some ingredients are missing nutrition data"
      description="Nutrition information may be incomplete for some ingredients."
    />
  </div>
  <div v-else class="text-center py-8 text-gray-500">
    <p>No nutrition data available</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  recipeId: string
  servings?: number
}>()

const nutrition = ref<any>(null)
const hasMissingData = computed(() => {
  if (!nutrition.value) return false
  return nutrition.value.ingredients.some((ing: any) => 
    ing.nutrition.energyKcal === 0 && 
    ing.nutrition.proteins === 0 &&
    ing.nutrition.carbohydrates === 0
  )
})

const loadNutrition = async () => {
  try {
    const data = await $fetch(`/api/recipes/${props.recipeId}/nutrition`, {
      params: {
        servings: props.servings || 1
      }
    })
    nutrition.value = data
  } catch (error) {
    console.error('Failed to load nutrition:', error)
    nutrition.value = null
  }
}

onMounted(() => {
  loadNutrition()
})

watch(() => props.servings, () => {
  loadNutrition()
})
</script>
