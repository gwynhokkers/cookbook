<template>
  <UPage>
    <UPageHero description="" color="neutral">
      <template #title>
        <span class="font-serif">
          Humboldt <span class="text-biolume-600">Kitchen</span>
        </span>
      </template>
      <template #description>
        <p class="">A collection of recipes by Inky the Squid</p>
      </template>
    </UPageHero>

    <UPageBody>
      <UPageSection>
        <Can :ability="createRecipe" as="div" class="mb-6">
          <UButton icon="i-heroicons-plus" to="/recipes/new">
            Create New Recipe
          </UButton>
        </Can>

        <section v-if="loggedIn && favoritesTotal > 0" class="mb-10">
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-2xl font-serif">Favourites</h2>
            <UButton
              to="/search?scope=favorites"
              icon="i-lucide-search"
              variant="outline"
              color="neutral"
            >
              Search favourites
            </UButton>
          </div>

          <UPageGrid>
            <RecipeCard
              v-for="recipe in favoriteItems"
              :key="recipe.id"
              :recipe="recipe"
              @favorite-changed="refreshFavorites"
            />
          </UPageGrid>

          <div v-if="favoritesTotalPages > 1" class="mt-6 flex justify-center">
            <UPagination
              :page="fpage"
              :items-per-page="6"
              :total="favoritesTotal"
              :to="favoritesPageLink"
            />
          </div>
        </section>

        <section>
          <h2 class="mb-4 text-2xl font-serif">Recent recipes</h2>

          <UPageGrid>
            <RecipeCard
              v-for="recipe in recentItems"
              :key="recipe.id"
              :recipe="recipe"
              @favorite-changed="refreshFavorites"
            />
          </UPageGrid>

          <div v-if="recentTotalPages > 1" class="mt-6 flex justify-center">
            <UPagination
              :page="page"
              :items-per-page="9"
              :total="recentTotal"
              :to="recentPageLink"
            />
          </div>
        </section>
      </UPageSection>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { createRecipe } from '~~/shared/utils/abilities'
import type { PaginatedRecipes } from '~~/shared/utils/recipeListTypes'
import { emptyPaginatedRecipes } from '~~/shared/utils/recipeListTypes'

const route = useRoute()
const { loggedIn } = useUserSession()
const { refreshFavoriteIds } = useRecipeFavorites()

const page = computed(() => Math.max(1, Number(route.query.page || 1)))
const fpage = computed(() => Math.max(1, Number(route.query.fpage || 1)))

const { data: recent, refresh: refreshRecent } = await useFetch<PaginatedRecipes>('/api/recipes', {
  query: computed(() => ({ page: page.value, limit: 9 })),
  watch: [page],
  default: () => emptyPaginatedRecipes(9)
})

const { data: favorites, refresh: refreshFavoritesData } = await useFetch<PaginatedRecipes>(
  () => (loggedIn.value ? '/api/recipes/favorites' : null),
  {
    query: computed(() => ({ page: fpage.value, limit: 6 })),
    watch: [fpage, loggedIn],
    default: () => emptyPaginatedRecipes(6)
  }
)

watch(loggedIn, (value) => {
  if (value) {
    refreshFavoritesData()
    refreshFavoriteIds()
  }
})

const recentItems = computed(() => recent.value?.items || [])
const recentTotal = computed(() => recent.value?.total || 0)
const recentTotalPages = computed(() => recent.value?.totalPages || 0)

const favoriteItems = computed(() => favorites.value?.items || [])
const favoritesTotal = computed(() => favorites.value?.total || 0)
const favoritesTotalPages = computed(() => favorites.value?.totalPages || 0)

function recentPageLink(nextPage: number) {
  const query = { ...route.query, page: nextPage === 1 ? undefined : String(nextPage) }
  if (!query.page) delete query.page
  return { query }
}

function favoritesPageLink(nextPage: number) {
  const query = { ...route.query, fpage: nextPage === 1 ? undefined : String(nextPage) }
  if (!query.fpage) delete query.fpage
  return { query }
}

async function refreshFavorites() {
  await Promise.all([
    refreshFavoritesData(),
    refreshRecent(),
    refreshFavoriteIds()
  ])
}

useSeoMeta({
  title: 'Humboldt Kitchen - A collection of recipes by Inky the Squid',
  ogTitle: 'Humboldt Kitchen - A collection of recipes by Inky the Squid'
})
</script>
