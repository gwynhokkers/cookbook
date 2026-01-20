<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Shopping List"
      description="Manage your shopping list from selected recipes"
    />

    <UPageBody>
      <div class="space-y-6">
        <!-- Recipe Selection -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Select Recipes</h2>
          <div v-if="recipesLoading" class="text-center py-4">
            <p>Loading recipes...</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="recipe in allRecipes"
              :key="recipe.id"
              class="flex items-center justify-between p-3 border rounded-lg"
            >
              <div>
                <div class="font-semibold">{{ recipe.title }}</div>
                <div v-if="recipe.description" class="text-sm text-gray-600 dark:text-gray-400">
                  {{ recipe.description }}
                </div>
              </div>
              <input
                type="checkbox"
                :checked="store.recipeIds.includes(recipe.id)"
                @change="toggleRecipe(recipe.id)"
                class="w-4 h-4"
              />
            </div>
          </div>
        </div>

        <USeparator />

        <!-- Shopping List -->
        <div>
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Ingredients</h2>
            <div class="flex gap-2">
              <UButton
                v-if="store.hasRecipes"
                variant="outline"
                @click="store.clearList"
              >
                Clear List
              </UButton>
              <UButton
                v-if="store.hasRecipes"
                variant="outline"
                @click="printList"
              >
                Print
              </UButton>
            </div>
          </div>
          <ShoppingList />
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { useShoppingListStore } from '~/stores/shoppingList'

const store = useShoppingListStore()

const { data: allRecipes, pending: recipesLoading } = await useFetch('/api/recipes')

const toggleRecipe = async (recipeId: string) => {
  if (store.recipeIds.includes(recipeId)) {
    await store.removeRecipe(recipeId)
  } else {
    await store.addRecipe(recipeId)
  }
}

const printList = () => {
  if (process.client) {
    window.print()
  }
}

onMounted(() => {
  store.loadFromLocalStorage()
})
</script>

<style>
@media print {
  .no-print {
    display: none;
  }
}
</style>
