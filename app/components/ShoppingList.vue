<template>
  <div class="space-y-4">
    <div v-if="ingredients.length === 0" class="text-center py-8 text-gray-500">
      <p>No ingredients in shopping list</p>
      <p class="text-sm mt-2">Add recipes to your shopping list to see ingredients here</p>
    </div>
    
    <div v-else class="space-y-2">
      <div
        v-for="ingredient in ingredients"
        :key="ingredient.ingredientId"
        class="flex items-center justify-between p-3 border rounded-lg"
      >
        <div class="flex-1">
          <div class="font-semibold">{{ ingredient.ingredientName }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">
            {{ ingredient.amount }} {{ ingredient.unit }}
            <span v-if="ingredient.recipes.length > 1" class="ml-2">
              (from {{ ingredient.recipes.length }} recipes)
            </span>
          </div>
        </div>
        <input
          type="checkbox"
          :checked="checkedItems[ingredient.ingredientId]"
          @change="checkedItems[ingredient.ingredientId] = ($event.target as HTMLInputElement).checked; updateChecked()"
          class="w-4 h-4"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useShoppingListStore } from '~/stores/shoppingList'

const store = useShoppingListStore()
const checkedItems = ref<Record<string, boolean>>({})

const ingredients = computed(() => store.getAggregatedIngredients())

const updateChecked = () => {
  // Save checked items to localStorage
  if (process.client) {
    try {
      localStorage.setItem('shoppingListChecked', JSON.stringify(checkedItems.value))
    } catch (e) {
      // Ignore
    }
  }
}

onMounted(() => {
  // Load checked items from localStorage
  if (process.client) {
    try {
      const stored = localStorage.getItem('shoppingListChecked')
      if (stored) {
        checkedItems.value = JSON.parse(stored)
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Load shopping list from localStorage
  store.loadFromLocalStorage()
})
</script>
