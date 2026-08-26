<script setup lang="ts">
import type { ShoppingListItemDto } from '~~/shared/utils/shoppingListTypes'

const props = defineProps<{
  items: ShoppingListItemDto[]
  loading?: boolean
}>()

const emit = defineEmits<{
  toggle: [itemId: string, checked: boolean]
}>()

const aisleOrder = [
  'Produce',
  'Bakery',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Spices',
  'Beverages',
  'Other'
]

const grouped = computed(() => {
  const map = new Map<string, ShoppingListItemDto[]>()
  for (const item of props.items) {
    const aisle = item.aisle || 'Other'
    const bucket = map.get(aisle) || []
    bucket.push(item)
    map.set(aisle, bucket)
  }

  const ordered = [
    ...aisleOrder.filter(name => map.has(name)),
    ...[...map.keys()].filter(name => !aisleOrder.includes(name)).sort()
  ]

  return ordered.map(aisle => ({
    aisle,
    items: map.get(aisle) || []
  }))
})
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!items.length"
      class="rounded-lg border border-dashed border-default px-4 py-8 text-center text-muted"
    >
      <p>No ingredients yet.</p>
      <p class="mt-1 text-sm">
        Add recipes, then generate with Humphry to build your aisle list.
      </p>
    </div>

    <div
      v-for="group in grouped"
      v-else
      :key="group.aisle"
      class="space-y-2"
    >
      <h3 class="text-sm font-semibold uppercase tracking-wide text-muted">
        {{ group.aisle }}
      </h3>
      <div
        v-for="item in group.items"
        :key="item.id"
        class="flex items-start gap-3 rounded-lg border border-default p-3"
      >
        <UCheckbox
          :model-value="item.checked"
          :disabled="loading"
          class="mt-1"
          @update:model-value="emit('toggle', item.id, Boolean($event))"
        />
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="font-medium">
              <span class="text-highlighted">{{ item.displayAmount }}</span>
              {{ item.name }}
            </p>
            <UBadge
              v-if="item.needsReview"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Review amounts
            </UBadge>
          </div>
          <p
            v-if="item.packageSuggestion"
            class="text-sm text-muted"
          >
            Buy: {{ item.packageSuggestion }}
          </p>
          <p
            v-if="item.substitutionNote"
            class="text-sm text-muted"
          >
            Note: {{ item.substitutionNote }}
          </p>
          <p
            v-if="item.contributions.length > 1 || item.needsReview"
            class="text-xs text-muted"
          >
            From:
            {{
              item.contributions
                .map(c => `${c.title} (${c.amount} ${c.unit})`.trim())
                .join(' · ')
            }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
