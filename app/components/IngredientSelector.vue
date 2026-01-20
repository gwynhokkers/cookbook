<template>
  <div class="space-y-2">
    <!-- Display selected ingredient or button to search -->
    <div v-if="selectedIngredient" class="flex items-center gap-2">
      <UInput
        :model-value="selectedIngredient.name"
        readonly
        class="flex-1"
      />
      <UButton
        icon="i-heroicons-x-mark"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="clearSelection"
      />
    </div>
    <UButton
      v-else
      variant="outline"
      class="w-full justify-start"
      @click="open = !open"
    >
      {{ modelValue || 'Add ingredient...' }}
    </UButton>

    <!-- Command Palette -->
    <UCommandPalette
      :open="open"
      v-model:search-term="searchTerm"
      :groups="groups"
      :fuse="fuseOptions"
      placeholder="Type ingredient name (min 3 chars) and click Search..."
      @update:open="open = $event"
      @update:model-value="handleSelect"
      @update:search-term="onSearchTermChange"
    >
      <template #footer>
        <div class="p-2 space-y-2 border-t">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <kbd>Esc</kbd>
              <span>to close</span>
            </div>
            <UButton
              v-if="searchTerm.trim().length >= 3"
              :loading="searching"
              size="sm"
              @click="handleSearch"
            >
              Search
            </UButton>
          </div>
          <div v-if="searching" class="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
            <span>Searching...</span>
          </div>
          <div v-if="error" class="text-xs text-red-600 dark:text-red-400">
            {{ error }}
          </div>
        </div>
      </template>
    </UCommandPalette>
  </div>
</template>

<script setup lang="ts">

interface SpoonacularIngredient {
  id: number
  name: string
  image?: string
  aisle?: string
  [key: string]: any
}

interface CommandPaletteItem {
  label: string
  suffix?: string
  icon?: string
  onSelect?: (e: Event) => void
  ingredient?: SpoonacularIngredient
}

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select': [ingredient: { name: string; spoonacularIngredientId?: number; spoonacularData?: any }]
}>()

const open = ref(false)
const searchTerm = ref('')
const groups = ref<Array<{ id: string; label?: string; items: CommandPaletteItem[]; ignoreFilter?: boolean; postFilter?: (searchTerm: string, items: CommandPaletteItem[]) => CommandPaletteItem[] }>>([])
const searching = ref(false)
const error = ref<string | null>(null)
const selectedIngredient = ref<SpoonacularIngredient | null>(null)
const fuseOptions = {
  fuseOptions: {
    ignoreLocation: true,
    threshold: 0.1,
    keys: ['label', 'suffix']
  },
  resultLimit: 20,
  matchAllWhenSearchEmpty: false
}

// Load from localStorage cache
const loadFromCache = (query: string): SpoonacularIngredient[] | null => {
  if (process.client) {
    try {
      const cached = localStorage.getItem(`spoonacular_search_${query.toLowerCase()}`)
      if (cached) {
        const data = JSON.parse(cached)
        // Check if cache is still valid (24 hours)
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data.results
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
  }
  return null
}

// Save to localStorage cache
const saveToCache = (query: string, results: SpoonacularIngredient[]) => {
  if (process.client) {
    try {
      localStorage.setItem(`spoonacular_search_${query.toLowerCase()}`, JSON.stringify({
        results,
        timestamp: Date.now()
      }))
    } catch (e) {
      // Ignore cache errors
    }
  }
}

// Fetch ingredients from API
const fetchIngredients = async (query: string) => {
  if (query.length < 3) {
    groups.value = []
    return
  }

  // Check cache first
  const cached = loadFromCache(query)
  if (cached && cached.length > 0) {
    updateGroups(cached)
    return
  }

  searching.value = true
  error.value = null

  try {
    const response = await $fetch<SpoonacularIngredient[]>('/api/spoonacular/ingredients/autocomplete', {
      params: { q: query }
    })
    
    const results = response || []
    saveToCache(query, results)
    updateGroups(results)
  } catch (err: any) {
    if (err.statusCode === 429) {
      error.value = 'Rate limit exceeded. Please wait a moment before searching again.'
    } else if (err.statusCode === 402) {
      error.value = 'API quota exceeded. Please check your plan limits.'
    } else {
      error.value = err.message || 'Failed to search ingredients'
    }
    groups.value = []
  } finally {
    searching.value = false
  }
}

// Update command palette groups with fetched ingredients
const updateGroups = (ingredients: SpoonacularIngredient[]) => {
  const items: CommandPaletteItem[] = ingredients.map((ing) => ({
    label: ing.name,
    suffix: ing.aisle || undefined,
    icon: 'i-heroicons-beaker',
    ingredient: ing,
    onSelect: () => handleSelect({
      label: ing.name,
      suffix: ing.aisle || undefined,
      icon: 'i-heroicons-beaker',
      ingredient: ing
    })
  }))

  // Add manual entry option if search term exists
  if (searchTerm.value.trim() && searchTerm.value.trim().length >= 3) {
    items.push({
      label: `Use "${searchTerm.value.trim()}" as ingredient name`,
      icon: 'i-heroicons-plus-circle',
      onSelect: () => handleManualEntry(searchTerm.value.trim())
    })
  }

  groups.value = [{
    id: 'ingredients',
    label: 'Ingredients',
    items,
    ignoreFilter: true, // We handle filtering via API
    postFilter: (term: string, items: CommandPaletteItem[]) => {
      // Filter out manual entry if it doesn't match
      return items.filter(item => {
        if (item.label.includes('Use "') && item.label.includes('" as ingredient name')) {
          return true // Always show manual entry option
        }
        return item.label.toLowerCase().includes(term.toLowerCase())
      })
    }
  }]
}

// Handle ingredient selection
const handleSelect = async (item: CommandPaletteItem) => {
  if (!item.ingredient) {
    // Manual entry
    const name = item.label.replace('Use "', '').replace('" as ingredient name', '')
    handleManualEntry(name)
    return
  }

  const ingredient = item.ingredient
  const name = ingredient.name
  
  // Fetch full ingredient info for nutrition data
  let ingredientData = null
  try {
    ingredientData = await $fetch(`/api/spoonacular/ingredients/${ingredient.id}/information`)
  } catch (err) {
    console.error('Failed to fetch ingredient details:', err)
    // Continue with basic info if detailed fetch fails
  }
  
  selectedIngredient.value = ingredient
  emit('select', {
    name,
    spoonacularIngredientId: ingredient.id,
    spoonacularData: ingredientData || ingredient
  })
  emit('update:modelValue', name)
  open.value = false
  searchTerm.value = ''
}

// Handle manual entry
const handleManualEntry = (name: string) => {
  selectedIngredient.value = { id: 0, name } as SpoonacularIngredient
  emit('select', { name: name.trim() })
  emit('update:modelValue', name.trim())
  open.value = false
  searchTerm.value = ''
}

// Clear selection
const clearSelection = () => {
  selectedIngredient.value = null
  emit('update:modelValue', '')
}

// Handle explicit search (via search button)
const handleSearch = () => {
  const term = searchTerm.value.trim()
  if (term && term.length >= 3) {
    fetchIngredients(term)
  }
}

// Handle search term changes - don't auto-search, just update
const onSearchTermChange = (term: string) => {
  searchTerm.value = term
  // Clear groups if term is too short
  if (term.trim().length < 3) {
    groups.value = []
  }
  // Don't auto-fetch - wait for explicit search button click
}

// Watch for command palette open/close
watch(() => open.value, (isOpen) => {
  if (isOpen) {
    searchTerm.value = ''
    groups.value = []
  }
})

// Sync with modelValue prop
watch(() => props.modelValue, (newValue) => {
  if (newValue && !selectedIngredient.value) {
    // If we have a value but no selected ingredient, create a manual entry
    selectedIngredient.value = { id: 0, name: newValue } as SpoonacularIngredient
  } else if (!newValue) {
    selectedIngredient.value = null
  }
})
</script>
