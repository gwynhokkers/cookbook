<script setup lang="ts">
import type { PaginatedRecipes, RecipeSummary } from '~~/shared/utils/recipeListTypes'
import { localDateIso, useShoppingList } from '~/composables/useShoppingList'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

const initialDate = typeof route.query.date === 'string' && route.query.date
  ? route.query.date
  : localDateIso()

const {
  listDate,
  list,
  pending,
  generating,
  refresh,
  setDate,
  setRecipes,
  removeRecipe,
  generate,
  toggleChecked,
  copyText
} = useShoppingList(initialDate)

const { data: recipesResponse, pending: recipesLoading } = await useFetch<
  RecipeSummary[] | PaginatedRecipes
>('/api/recipes', {
  query: { page: 1, limit: 100 }
})

const recipeOptions = computed(() => {
  const raw = recipesResponse.value
  if (!raw) {
    return [] as RecipeSummary[]
  }
  if (Array.isArray(raw)) {
    return raw
  }
  return raw.items || []
})

const selectedRecipeIds = computed(() => list.value?.recipes.map(r => r.id) || [])

async function onDateChange(value: string | null) {
  if (!value) {
    return
  }
  await setDate(value)
  await router.replace({ query: { ...route.query, date: value } })
}

async function onToggleRecipe(recipeId: string, checked: boolean | 'indeterminate') {
  const current = new Set(selectedRecipeIds.value)
  if (checked) {
    current.add(recipeId)
  } else {
    current.delete(recipeId)
  }
  await setRecipes([...current])
}

async function onGenerate() {
  try {
    await generate()
  } catch (err) {
    toast.add({
      title: 'Generate failed',
      description: err instanceof Error ? err.message : 'Could not generate shopping list',
      color: 'error'
    })
  }
}

function printList() {
  if (import.meta.client) {
    window.print()
  }
}

onMounted(() => {
  refresh().catch(() => {
    /* shown via error state */
  })
})

watch(
  () => route.query.date,
  (next) => {
    if (typeof next === 'string' && next && next !== listDate.value) {
      setDate(next)
    }
  }
)
</script>

<template>
  <UPage class="container mx-auto px-4 py-8">
    <UPageHeader
      title="Shopping List"
      description="Select recipes for a day, then let Humphry organize aisle shopping totals."
    />

    <UPageBody>
      <div class="space-y-8">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <UFormField
            label="List date"
            class="w-full max-w-xs"
          >
            <UInput
              type="date"
              :model-value="listDate"
              @update:model-value="onDateChange(String($event || ''))"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-lucide-sparkles"
              :loading="generating"
              :disabled="!list?.recipes.length || generating"
              @click="onGenerate"
            >
              Generate with Humphry
            </UButton>
            <UButton
              variant="outline"
              icon="i-lucide-copy"
              :disabled="!list?.items.length"
              @click="copyText()"
            >
              Copy
            </UButton>
            <UButton
              variant="outline"
              icon="i-lucide-printer"
              :disabled="!list?.items.length"
              class="no-print"
              @click="printList"
            >
              Print
            </UButton>
          </div>
        </div>

        <UAlert
          v-if="list?.warning"
          color="warning"
          variant="subtle"
          title="Generated without full AI enrichment"
          :description="list.warning"
        />

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold">
              Recipes for this day
            </h2>
            <p class="text-sm text-muted">
              {{ list?.recipes.length || 0 }} selected
            </p>
          </div>

          <div
            v-if="recipesLoading || pending"
            class="text-sm text-muted"
          >
            Loading recipes…
          </div>

          <div
            v-else
            class="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-default p-2"
          >
            <label
              v-for="recipe in recipeOptions"
              :key="recipe.id"
              class="flex cursor-pointer items-start justify-between gap-3 rounded-md p-2 hover:bg-elevated"
            >
              <div class="min-w-0">
                <p class="font-medium">
                  {{ recipe.title }}
                </p>
                <p
                  v-if="recipe.description"
                  class="line-clamp-2 text-sm text-muted"
                >
                  {{ recipe.description }}
                </p>
              </div>
              <UCheckbox
                :model-value="selectedRecipeIds.includes(recipe.id)"
                @update:model-value="onToggleRecipe(recipe.id, $event)"
              />
            </label>
          </div>

          <div
            v-if="list?.recipes.length"
            class="flex flex-wrap gap-2"
          >
            <UBadge
              v-for="recipe in list.recipes"
              :key="recipe.id"
              variant="subtle"
              class="gap-1"
            >
              {{ recipe.title }}
              <button
                type="button"
                class="ml-1 opacity-70 hover:opacity-100"
                aria-label="Remove recipe"
                @click="removeRecipe(recipe.id)"
              >
                ×
              </button>
            </UBadge>
          </div>
        </section>

        <USeparator />

        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">
              Ingredients
            </h2>
            <UBadge
              v-if="list"
              variant="subtle"
              :color="list.status === 'generated' ? 'success' : 'neutral'"
            >
              {{ list.status }}
            </UBadge>
          </div>

          <ShoppingList
            :items="list?.items || []"
            :loading="pending || generating"
            @toggle="toggleChecked"
          />
        </section>
      </div>
    </UPageBody>
  </UPage>
</template>

<style>
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
