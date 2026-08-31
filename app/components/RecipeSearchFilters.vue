<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import {
  DIET_TAGS,
  type DietTag
} from '~~/shared/utils/dietTags'
import {
  parseRecipeSearchFilters,
  serializeRecipeSearchFilters,
  type RecipeSearchFilters,
  type TimeFilter
} from '~~/shared/utils/recipeSearchFilters'
import type { PaginatedRecipeSearchResults } from '~~/shared/utils/recipeSearchTypes'
import { emptyPaginatedSearchResults } from '~~/shared/utils/recipeSearchTypes'

const props = defineProps<{
  filters: RecipeSearchFilters
}>()

const emit = defineEmits<{
  'update:filters': [filters: RecipeSearchFilters]
}>()

const sourceQuery = ref('')
const debouncedSourceQuery = refDebounced(sourceQuery, 200)

const { data: tagOptions } = await useFetch<{ tags: string[] }>('/api/recipes/tags', {
  default: () => ({ tags: [] })
})

const { data: sourceOptions, refresh: refreshSources } = await useFetch<{ sources: string[] }>(
  () => `/api/recipes/sources?q=${encodeURIComponent(debouncedSourceQuery.value.trim())}`,
  { watch: [debouncedSourceQuery], default: () => ({ sources: [] }) }
)

watch(debouncedSourceQuery, () => refreshSources())

const timeOptions: Array<{ label: string, value: TimeFilter | '' }> = [
  { label: 'Any time', value: '' },
  { label: 'Under 30 min', value: 'under-30' },
  { label: '30–60 min', value: '30-60' },
  { label: 'Over 60 min', value: 'over-60' }
]

function dietLabel(diet: DietTag) {
  return diet.charAt(0).toUpperCase() + diet.slice(1)
}

function patchFilters(patch: Partial<RecipeSearchFilters>) {
  emit('update:filters', { ...props.filters, ...patch })
}

function toggleTag(tag: string, checked: boolean) {
  const tags = checked
    ? [...props.filters.tags.filter((t) => t !== tag), tag]
    : props.filters.tags.filter((t) => t !== tag)
  patchFilters({ tags })
}

function toggleSource(source: string) {
  if (props.filters.sources.includes(source)) {
    patchFilters({ sources: props.filters.sources.filter((s) => s !== source) })
  } else {
    patchFilters({ sources: [...props.filters.sources, source] })
  }
}

function toggleDiet(diet: DietTag, checked: boolean) {
  const dietTags = checked
    ? [...props.filters.diet.filter((d) => d !== diet), diet]
    : props.filters.diet.filter((d) => d !== diet)
  patchFilters({ diet: dietTags })
}

function setTime(value: TimeFilter | '') {
  patchFilters({ time: value || null })
}

const selectedTime = computed({
  get: () => props.filters.time || '',
  set: (value: TimeFilter | '') => setTime(value)
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h3 class="mb-2 text-sm font-semibold">Tags</h3>
      <div class="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-default p-3">
        <label
          v-for="tag in tagOptions?.tags || []"
          :key="tag"
          class="flex items-center gap-2 text-sm"
        >
          <UCheckbox
            :model-value="filters.tags.includes(tag)"
            @update:model-value="(checked) => toggleTag(tag, Boolean(checked))"
          />
          {{ tag }}
        </label>
        <p v-if="!(tagOptions?.tags || []).length" class="text-sm text-muted">No tags yet.</p>
      </div>
    </div>

    <div>
      <h3 class="mb-2 text-sm font-semibold">Sources</h3>
      <UInput
        v-model="sourceQuery"
        placeholder="Search books..."
        icon="i-lucide-book"
        class="mb-2"
      />
      <div class="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-default p-2">
        <button
          v-for="source in sourceOptions?.sources || []"
          :key="source"
          type="button"
          class="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-elevated"
          :class="filters.sources.includes(source) ? 'bg-elevated font-medium' : ''"
          @click="toggleSource(source)"
        >
          {{ source }}
        </button>
        <p v-if="!(sourceOptions?.sources || []).length" class="px-2 py-1 text-sm text-muted">
          Type to search sources.
        </p>
      </div>
    </div>

    <div>
      <h3 class="mb-2 text-sm font-semibold">Diet</h3>
      <div class="flex flex-col gap-2">
        <label
          v-for="diet in DIET_TAGS"
          :key="diet"
          class="inline-flex items-center gap-2 text-sm"
        >
          <UCheckbox
            :model-value="filters.diet.includes(diet)"
            @update:model-value="(checked) => toggleDiet(diet, Boolean(checked))"
          />
          {{ dietLabel(diet) }}
        </label>
      </div>
    </div>

    <div>
      <h3 class="mb-2 text-sm font-semibold">Time</h3>
      <URadioGroup
        v-model="selectedTime"
        :items="timeOptions"
      />
    </div>
  </div>
</template>
