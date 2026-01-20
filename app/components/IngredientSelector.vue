<template>
  <div class="space-y-2">
    <div class="flex gap-2">
      <UInput
        v-model="searchQuery"
        placeholder="Search ingredient or enter manually"
        :disabled="searching"
        @keyup.enter="handleSearch"
        @input="onInput"
        class="flex-1"
      />
      <UButton
        :disabled="searchQuery.length < 3 || searching"
        :loading="searching"
        @click="handleSearch"
      >
        Search
      </UButton>
    </div>

    <!-- Search results -->
    <div v-if="searchResults.length > 0" class="border rounded-lg p-2 space-y-2 max-h-60 overflow-y-auto">
      <div
        v-for="product in searchResults"
        :key="product.code"
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
        @click="selectProduct(product)"
      >
        <div class="font-semibold">{{ product.name || 'Unknown' }}</div>
        <div v-if="product.aisle" class="text-sm text-gray-600 dark:text-gray-400">{{ product.aisle }}</div>
      </div>
    </div>

    <!-- Manual entry option -->
    <div v-if="searchQuery && searchResults.length === 0 && !searching" class="text-sm text-gray-600 dark:text-gray-400">
      <UButton
        variant="ghost"
        size="sm"
        @click="selectManual"
      >
        Use "{{ searchQuery }}" as ingredient name
      </UButton>
    </div>

    <!-- Error message -->
    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      :title="error"
    />

    <!-- Rate limit warning -->
    <UAlert
      v-if="rateLimited"
      color="warning"
      variant="soft"
      title="Rate limit reached. Please wait a moment before searching again."
    />
    
    <!-- Quota exceeded warning -->
    <UAlert
      v-if="quotaExceeded"
      color="error"
      variant="soft"
      title="API quota exceeded. Please check your plan limits."
    />
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

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select': [ingredient: { name: string; spoonacularIngredientId?: number; spoonacularData?: any }]
}>()

const searchQuery = ref(props.modelValue || '')
const searchResults = ref<SpoonacularIngredient[]>([])
const searching = ref(false)
const error = ref<string | null>(null)
const rateLimited = ref(false)
const quotaExceeded = ref(false)
const debounceTimer = ref<NodeJS.Timeout | null>(null)

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

const onInput = () => {
  // Clear previous debounce
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value)
  }

  // Debounce search (500ms minimum)
  debounceTimer.value = setTimeout(() => {
    if (searchQuery.value.length >= 3) {
      handleSearch()
    }
  }, 500)
}

const handleSearch = async () => {
  const query = searchQuery.value.trim()
  
  if (query.length < 3) {
    return
  }

  // Check cache first
  const cached = loadFromCache(query)
  if (cached) {
    searchResults.value = cached
    return
  }

  searching.value = true
  error.value = null
  rateLimited.value = false

  try {
    const response = await $fetch<SpoonacularIngredient[]>('/api/spoonacular/ingredients/autocomplete', {
      params: { q: query }
    })
    
    searchResults.value = response || []
    saveToCache(query, searchResults.value)
  } catch (err: any) {
    if (err.statusCode === 429) {
      rateLimited.value = true
      error.value = 'Rate limit exceeded. Please wait a moment before searching again.'
    } else if (err.statusCode === 402) {
      quotaExceeded.value = true
      error.value = 'API quota exceeded. Please check your plan limits.'
    } else {
      error.value = err.message || 'Failed to search ingredients'
    }
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

const selectProduct = async (ingredient: SpoonacularIngredient) => {
  const name = ingredient.name || searchQuery.value
  
  // Fetch full ingredient info for nutrition data
  let ingredientData = null
  try {
    ingredientData = await $fetch(`/api/spoonacular/ingredients/${ingredient.id}/information`)
  } catch (err) {
    console.error('Failed to fetch ingredient details:', err)
    // Continue with basic info if detailed fetch fails
  }
  
  emit('select', {
    name,
    spoonacularIngredientId: ingredient.id,
    spoonacularData: ingredientData || ingredient
  })
  searchResults.value = []
  searchQuery.value = name
}

const selectManual = () => {
  emit('select', {
    name: searchQuery.value.trim()
  })
  searchResults.value = []
}

watch(() => props.modelValue, (newValue) => {
  if (newValue !== searchQuery.value) {
    searchQuery.value = newValue || ''
  }
})

watch(searchQuery, (newValue) => {
  emit('update:modelValue', newValue)
})
</script>
