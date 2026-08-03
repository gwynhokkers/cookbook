<template>
  <div class="relative">
    <UInput
      v-model="query"
      :placeholder="placeholder"
      autocomplete="off"
      class="w-full"
      @focus="onFocus"
      @blur="onBlur"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="close"
    />

    <div
      v-if="open && (suggestions.length > 0 || query.trim().length >= MIN_CHARS)"
      class="absolute z-20 mt-1 w-full rounded-lg border border-default bg-default shadow-lg max-h-64 overflow-y-auto"
    >
      <div
        v-if="searching"
        class="flex items-center gap-2 px-3 py-2 text-xs text-muted"
      >
        <UIcon
          name="i-heroicons-arrow-path"
          class="animate-spin"
        />
        <span>Searching…</span>
      </div>

      <ul
        v-if="suggestions.length > 0"
        class="py-1"
      >
        <li
          v-for="(item, index) in suggestions"
          :key="`${item.source}-${item.id ?? item.name}-${index}`"
        >
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-elevated"
            @mousedown.prevent="selectSuggestion(item)"
          >
            <span class="truncate">{{ item.name }}</span>
            <UBadge
              :color="item.source === 'library' ? 'neutral' : 'primary'"
              variant="subtle"
              size="xs"
            >
              {{ item.source === 'library' ? 'Library' : 'Spoonacular' }}
            </UBadge>
          </button>
        </li>
      </ul>

      <button
        v-if="query.trim().length >= MIN_CHARS"
        type="button"
        class="flex w-full items-center gap-2 border-t border-default px-3 py-2 text-left text-sm text-muted hover:bg-elevated"
        @mousedown.prevent="useAsIs"
      >
        <UIcon
          name="i-heroicons-plus-circle"
          class="size-4 shrink-0"
        />
        <span class="truncate">Use “{{ query.trim() }}” as-is</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Suggestion {
  name: string
  id?: number
  source: 'library' | 'spoonacular'
}

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
}>(), {
  modelValue: '',
  placeholder: 'Ingredient name'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select': [value: { name: string, spoonacularIngredientId?: number }]
}>()

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

const query = ref(props.modelValue || '')
const open = ref(false)
const searching = ref(false)
const suggestions = ref<Suggestion[]>([])
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastSearched = ''

watch(() => props.modelValue, (value) => {
  if ((value || '') !== query.value) {
    query.value = value || ''
  }
})

watch(query, (value) => {
  emit('update:modelValue', value)
  scheduleSearch(value)
})

const scheduleSearch = (value: string) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const term = value.trim()
  if (term.length < MIN_CHARS) {
    suggestions.value = []
    searching.value = false
    return
  }
  debounceTimer = setTimeout(() => runSearch(term), DEBOUNCE_MS)
}

const runSearch = async (term: string) => {
  if (term === lastSearched) return
  lastSearched = term
  searching.value = true
  try {
    // Local library first (instant, no Spoonacular quota).
    const local = await $fetch<Array<{ id: string, name: string, spoonacularIngredientId?: string | null }>>(
      `/api/ingredients/search?q=${encodeURIComponent(term)}`
    ).catch(() => [])

    const localSuggestions: Suggestion[] = (local || []).map(item => ({
      name: item.name,
      id: item.spoonacularIngredientId ? Number(item.spoonacularIngredientId) : undefined,
      source: 'library' as const
    }))

    let combined = localSuggestions

    // Fall back to Spoonacular autocomplete when the library has no useful match.
    if (localSuggestions.length === 0) {
      const remote = await $fetch<Array<{ id: number, name: string }>>(
        '/api/spoonacular/ingredients/autocomplete',
        { params: { q: term } }
      ).catch(() => [])
      combined = (remote || []).map(item => ({
        name: item.name,
        id: item.id,
        source: 'spoonacular' as const
      }))
    }

    // Only show if the user hasn't moved on to a different term.
    if (lastSearched === term) {
      suggestions.value = combined.slice(0, 10)
    }
  } finally {
    if (lastSearched === term) {
      searching.value = false
    }
  }
}

const onFocus = () => {
  open.value = true
  if (query.value.trim().length >= MIN_CHARS && suggestions.value.length === 0) {
    scheduleSearch(query.value)
  }
}

const onBlur = () => {
  // Delay so a mousedown on a suggestion is processed first.
  setTimeout(() => {
    open.value = false
  }, 120)
}

const close = () => {
  open.value = false
}

const selectSuggestion = (item: Suggestion) => {
  query.value = item.name
  emit('update:modelValue', item.name)
  emit('select', { name: item.name, spoonacularIngredientId: item.id })
  open.value = false
}

const useAsIs = () => {
  const name = query.value.trim()
  if (!name) return
  emit('update:modelValue', name)
  emit('select', { name })
  open.value = false
}

const onEnter = () => {
  if (suggestions.value.length > 0 && suggestions.value[0]) {
    selectSuggestion(suggestions.value[0])
  } else {
    useAsIs()
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>
