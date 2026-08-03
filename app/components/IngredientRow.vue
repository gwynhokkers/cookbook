<template>
  <div class="rounded-lg border border-default p-3 space-y-2">
    <div class="flex items-start gap-2">
      <div class="flex-1 space-y-1">
        <div class="flex items-center gap-2">
          <UInput
            v-model="model.lineText"
            :placeholder="placeholder"
            autocomplete="off"
            class="w-full"
            @blur="onLineBlur"
            @keydown.enter.prevent="parseNow"
          />
          <span
            v-if="statusMeta"
            class="inline-flex shrink-0 items-center gap-1 text-xs"
            :class="statusMeta.class"
          >
            <UIcon
              :name="statusMeta.icon"
              :class="statusMeta.spin ? 'animate-spin' : ''"
              class="size-3.5"
            />
            {{ statusMeta.label }}
          </span>
        </div>
        <p
          v-if="previewLine && previewLine !== model.lineText.trim()"
          class="text-xs text-muted"
        >
          Will save as: <span class="font-medium">{{ previewLine }}</span>
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-1">
        <UButton
          type="button"
          :icon="expanded ? 'i-heroicons-chevron-up' : 'i-heroicons-adjustments-horizontal'"
          color="neutral"
          variant="ghost"
          size="sm"
          :title="expanded ? 'Hide details' : 'Edit details'"
          @click="expanded = !expanded"
        />
        <UButton
          type="button"
          icon="i-heroicons-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === 0"
          @click="$emit('move-up')"
        />
        <UButton
          type="button"
          icon="i-heroicons-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === total - 1"
          @click="$emit('move-down')"
        />
        <UButton
          type="button"
          icon="i-heroicons-trash"
          color="error"
          variant="ghost"
          size="sm"
          @click="$emit('remove')"
        />
      </div>
    </div>

    <div
      v-if="expanded"
      class="grid grid-cols-1 gap-3 border-t border-default pt-3 md:grid-cols-12"
    >
      <div class="md:col-span-2">
        <label class="mb-1 block text-xs text-muted">Amount</label>
        <UInput
          v-model="model.amount"
          type="number"
          step="0.1"
          placeholder="1"
          @update:model-value="onStructuredEdit"
        />
      </div>
      <div class="md:col-span-3">
        <label class="mb-1 block text-xs text-muted">Unit</label>
        <USelect
          v-model="model.unit"
          :items="unitOptions"
          class="w-full"
          @update:model-value="onStructuredEdit"
        />
      </div>
      <div class="md:col-span-7">
        <label class="mb-1 block text-xs text-muted">Ingredient</label>
        <IngredientAutocomplete
          v-model="model.ingredientName"
          @select="onNameSelect"
        />
      </div>
      <div class="md:col-span-12">
        <label class="mb-1 block text-xs text-muted">Notes</label>
        <UInput
          v-model="model.notes"
          placeholder="optional, e.g. chopped, room temperature"
          size="sm"
          @update:model-value="onStructuredEdit"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  COUNT_UNIT,
  formatIngredientLine,
  normalizeParsedIngredient,
  type ParsedSpoonacularIngredient
} from '~~/shared/utils/formatIngredient'

export interface IngredientRowModel {
  rowId: string
  lineText: string
  amount: string
  unit: string
  ingredientName: string
  ingredientId?: string
  spoonacularIngredientId?: number
  spoonacularData?: Record<string, unknown>
  notes?: string
  parseStatus?: 'idle' | 'parsing' | 'matched' | 'parsed' | 'manual' | 'failed'
}

defineProps<{
  index: number
  total: number
}>()

defineEmits<{
  'move-up': []
  'move-down': []
  'remove': []
}>()

const model = defineModel<IngredientRowModel>({ required: true })

const placeholder = 'e.g. 1 lemon, juiced or 200g flour'

const unitOptions = [
  { label: 'each / whole', value: COUNT_UNIT },
  { label: 'tsp', value: 'tsp' },
  { label: 'tbsp', value: 'tbsp' },
  { label: 'cups', value: 'cups' },
  { label: 'ml', value: 'ml' },
  { label: 'l', value: 'l' },
  { label: 'grams', value: 'grams' },
  { label: 'kg', value: 'kg' },
  { label: 'oz', value: 'oz' },
  { label: 'lb', value: 'lb' },
  { label: 'cloves', value: 'cloves' },
  { label: 'slices', value: 'slices' }
]

const expanded = ref(false)
const DEBOUNCE_MS = 700

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressParseWatcher = false
let lastParsedText = ''

const previewLine = computed(() => formatIngredientLine({
  amount: model.value.amount,
  unit: model.value.unit,
  name: model.value.ingredientName,
  notes: model.value.notes
}))

const statusMeta = computed(() => {
  switch (model.value.parseStatus) {
    case 'parsing':
      return { label: 'Matching…', icon: 'i-heroicons-arrow-path', spin: true, class: 'text-muted' }
    case 'matched':
      return { label: 'Matched', icon: 'i-heroicons-check-circle', spin: false, class: 'text-primary' }
    case 'parsed':
      return { label: 'Parsed', icon: 'i-heroicons-check-circle', spin: false, class: 'text-primary' }
    case 'manual':
      return { label: 'Manual', icon: 'i-heroicons-pencil', spin: false, class: 'text-muted' }
    case 'failed':
      return { label: 'Edit details', icon: 'i-heroicons-exclamation-triangle', spin: false, class: 'text-warning' }
    default:
      return null
  }
})

const scheduleParse = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const text = model.value.lineText.trim()
  if (text.length < 2) {
    model.value.parseStatus = 'idle'
    return
  }
  debounceTimer = setTimeout(() => {
    void parseNow()
  }, DEBOUNCE_MS)
}

watch(() => model.value.lineText, () => {
  if (suppressParseWatcher) {
    suppressParseWatcher = false
    return
  }
  scheduleParse()
})

const parseNow = async () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const text = model.value.lineText.trim()
  if (text.length < 2) {
    model.value.parseStatus = 'idle'
    return
  }
  if (text === lastParsedText && model.value.parseStatus && model.value.parseStatus !== 'idle') {
    return
  }

  lastParsedText = text
  model.value.parseStatus = 'parsing'

  try {
    const results = await $fetch<ParsedSpoonacularIngredient[]>('/api/spoonacular/ingredients/parse', {
      method: 'POST',
      body: { ingredients: [text] }
    })

    const parsed = Array.isArray(results) ? results[0] : null
    if (!parsed || !parsed.name) {
      model.value.parseStatus = 'failed'
      expanded.value = true
      return
    }

    applyParsed(parsed)
  } catch (error) {
    console.error('Failed to parse ingredient line:', error)
    model.value.parseStatus = 'failed'
    expanded.value = true
  }
}

const applyParsed = (parsed: ParsedSpoonacularIngredient) => {
  const normalized = normalizeParsedIngredient(parsed)
  model.value.amount = normalized.amount
  model.value.unit = normalized.unit
  model.value.ingredientName = normalized.ingredientName
  model.value.notes = normalized.notes
  model.value.spoonacularIngredientId = normalized.spoonacularIngredientId
  model.value.spoonacularData = normalized.spoonacularData
  // A re-link means the cached library id no longer necessarily matches; let save resolve it.
  model.value.ingredientId = undefined
  model.value.parseStatus = normalized.spoonacularIngredientId ? 'matched' : 'parsed'
}

const onLineBlur = () => {
  void parseNow()
}

// When the user edits structured fields directly, regenerate the line preview and stop
// treating the row as auto-parsed.
const onStructuredEdit = () => {
  rebuildLineFromStructured()
  if (model.value.parseStatus !== 'manual') {
    model.value.parseStatus = 'manual'
  }
}

const onNameSelect = (value: { name: string, spoonacularIngredientId?: number }) => {
  model.value.ingredientName = value.name
  if (value.spoonacularIngredientId) {
    model.value.spoonacularIngredientId = value.spoonacularIngredientId
    // Nutrition will be (re)fetched via the batch parse safety net on save.
    model.value.spoonacularData = undefined
  } else {
    model.value.spoonacularIngredientId = undefined
    model.value.spoonacularData = undefined
  }
  model.value.ingredientId = undefined
  rebuildLineFromStructured()
  model.value.parseStatus = 'manual'
}

const rebuildLineFromStructured = () => {
  const line = formatIngredientLine({
    amount: model.value.amount,
    unit: model.value.unit,
    name: model.value.ingredientName,
    notes: model.value.notes
  })
  suppressParseWatcher = true
  model.value.lineText = line
  lastParsedText = line
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>
