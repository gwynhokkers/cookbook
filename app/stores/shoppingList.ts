import { defineStore } from 'pinia'

export interface ShoppingListIngredient {
  ingredientId: string
  ingredientName: string
  amount: number
  unit: string
  recipes: string[] // Recipe IDs that contribute to this ingredient
}

export interface ShoppingListState {
  recipeIds: string[]
  ingredients: ShoppingListIngredient[]
}

export const useShoppingListStore = defineStore('shoppingList', {
  state: (): ShoppingListState => ({
    recipeIds: [],
    ingredients: []
  }),

  getters: {
    hasRecipes: (state) => state.recipeIds.length > 0,
    recipeCount: (state) => state.recipeIds.length,
    ingredientCount: (state) => state.ingredients.length
  },

  actions: {
    /**
     * Add a recipe to the shopping list
     */
    async addRecipe(recipeId: string) {
      if (this.recipeIds.includes(recipeId)) {
        return // Already in list
      }

      this.recipeIds.push(recipeId)
      await this.updateIngredients()
      this.saveToLocalStorage()
    },

    /**
     * Remove a recipe from the shopping list
     */
    async removeRecipe(recipeId: string) {
      const index = this.recipeIds.indexOf(recipeId)
      if (index > -1) {
        this.recipeIds.splice(index, 1)
        await this.updateIngredients()
        this.saveToLocalStorage()
      }
    },

    /**
     * Clear the entire shopping list
     */
    clearList() {
      this.recipeIds = []
      this.ingredients = []
      this.saveToLocalStorage()
    },

    /**
     * Update ingredients by fetching all recipes and aggregating
     */
    async updateIngredients() {
      if (this.recipeIds.length === 0) {
        this.ingredients = []
        return
      }

      try {
        // Aggregate ingredients
        const ingredientMap = new Map<string, ShoppingListIngredient>()

        for (const recipeId of this.recipeIds) {
          // Fetch recipe ingredients
          const recipeIngredients = await $fetch<Array<{
            ingredientId: string
            amount: string
            unit: string
            ingredient?: { name: string }
          }>>(`/api/recipes/${recipeId}/ingredients`).catch(() => [])

          for (const ri of recipeIngredients) {
            const key = ri.ingredientId
            const existing = ingredientMap.get(key)

            if (existing) {
              // Try to sum amounts (simplified - assumes same unit)
              // In a real implementation, you'd want to convert units
              if (existing.unit === ri.unit) {
                existing.amount += parseFloat(ri.amount) || 0
              } else {
                // Different units - keep separate or convert
                // For now, just add to recipes list
                existing.amount += parseFloat(ri.amount) || 0
              }
              if (!existing.recipes.includes(recipeId)) {
                existing.recipes.push(recipeId)
              }
            } else {
              ingredientMap.set(key, {
                ingredientId: ri.ingredientId,
                ingredientName: ri.ingredient?.name || 'Unknown',
                amount: parseFloat(ri.amount) || 0,
                unit: ri.unit,
                recipes: [recipeId]
              })
            }
          }
        }

        this.ingredients = Array.from(ingredientMap.values())
      } catch (error) {
        console.error('Failed to update shopping list ingredients:', error)
        this.ingredients = []
      }
    },

    /**
     * Get aggregated ingredients (computed getter)
     */
    getAggregatedIngredients(): ShoppingListIngredient[] {
      return this.ingredients
    },

    /**
     * Save state to localStorage
     */
    saveToLocalStorage() {
      if (process.client) {
        try {
          localStorage.setItem('shoppingList', JSON.stringify({
            recipeIds: this.recipeIds
          }))
        } catch (error) {
          console.error('Failed to save shopping list to localStorage:', error)
        }
      }
    },

    /**
     * Load state from localStorage
     */
    loadFromLocalStorage() {
      if (process.client) {
        try {
          const stored = localStorage.getItem('shoppingList')
          if (stored) {
            const data = JSON.parse(stored)
            this.recipeIds = data.recipeIds || []
            this.updateIngredients()
          }
        } catch (error) {
          console.error('Failed to load shopping list from localStorage:', error)
        }
      }
    }
  }
})
