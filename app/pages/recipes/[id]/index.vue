<template>
  <UPage
    class="container mx-auto flex flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8"
  >
    <template #left>
      <UPageAside class="hidden lg:block">
        <div class="">
          <UContentToc
            title="On this page"
            :links="links"
            highlight
            highlight-color="neutral"
            color="neutral"
          />
        </div>
        <nav v-if="navigation.length" class="mt-6">
          <p
            class="mb-2 text-xs font-medium uppercase tracking-wide text-muted"
          >
            Similar recipes
          </p>
          <ul class="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            <li v-for="item in navigation" :key="item.to">
              <ULink
                :to="item.to"
                class="block rounded-md px-2 py-1.5 text-sm text-muted hover:bg-elevated hover:text-highlighted"
                active-class="bg-elevated text-highlighted font-medium"
              >
                {{ item.title }}
              </ULink>
            </li>
          </ul>
        </nav>
      </UPageAside>
    </template>
    <header class="space-y-4">
      <div class="flex items-center gap-2 justify-between">
        <h1
          class="font-serif text-3xl leading-tight text-pretty sm:text-4xl lg:text-5xl"
        >
          {{ recipe?.title }}
        </h1>
        <UBadge
          v-if="recipe?.visibility === 'private'"
          color="warning"
          variant="subtle"
          class="shrink-0 hidden sm:block"
        >
          <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
          Private
        </UBadge>
      </div>
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex flex-wrap items-center gap-2">
          <RecipeFavoriteButton
            v-if="recipe"
            :recipe-id="recipe.id"
            class="shrink-0"
          />
          <UBadge
            v-if="recipe?.visibility === 'private'"
            color="warning"
            variant="subtle"
            class="shrink-0 sm:hidden"
          >
            <UIcon name="i-heroicons-lock-closed" class="mr-1 size-3" />
            Private
          </UBadge>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            v-if="recipe"
            icon="i-lucide-shopping-cart"
            variant="soft"
            color="neutral"
            class="shrink-0"
            :loading="addingToList"
            @click="addToTodayList"
          >
            <span class="hidden sm:inline">Add to list</span>
          </UButton>
          <Can v-if="recipe" :ability="editRecipeAbility">
            <UButton
              icon="i-heroicons-pencil"
              variant="ghost"
              :to="`/recipes/${recipe.id}/edit`"
              aria-label="Edit recipe"
            >
              <span class="hidden sm:inline">Edit</span>
            </UButton>
            <UButton
              icon="i-heroicons-trash"
              variant="ghost"
              color="error"
              aria-label="Delete recipe"
              @click="handleDelete"
            >
              <span class="hidden sm:inline">Delete</span>
            </UButton>
          </Can>
        </div>
      </div>
    </header>

    <div class="space-y-4 pb-1.5">
      <NuxtPicture
        v-if="recipe?.imageUrl"
        :src="recipe.imageUrl"
        :alt="recipe.title"
        :img-attrs="{
          class: 'w-full rounded-lg overflow-hidden max-h-[600px] object-cover',
        }"
        :width="800"
        :height="600"
        provider="blob"
      />
      <div class="flex flex-col gap-3">
        <div v-if="recipe?.tags?.length" class="flex flex-wrap gap-2">
          <UBadge
            v-for="(item, index) in recipe?.tags || []"
            :key="index"
            color="primary"
            class="rounded-full"
          >
            {{ item }}
          </UBadge>
        </div>
        <RecipeSource v-if="recipe?.source" :source="recipe.source" />
        <p v-if="timeLabel" class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-clock" class="size-4" />
          {{ timeLabel }}
        </p>
      </div>
    </div>
    <USeparator />
    <UPageBody class="space-y-8">
      <div
        v-if="recipe?.description"
        class="max-w-4xl prose prose-sm sm:prose-base"
      >
        <p>{{ recipe.description }}</p>
      </div>

      <RecipeIngredientList
        v-if="recipeIngredients && recipeIngredients.length > 0"
      >
        <ul class="list-disc list-inside space-y-2 max-w-4xl">
          <li v-for="(ri, index) in recipeIngredients" :key="index">
            {{
              formatIngredientLine({
                amount: ri.amount,
                unit: ri.unit,
                name: ri.ingredient?.name || "Unknown",
              })
            }}
            <span v-if="ri.notes" class="text-gray-600 dark:text-gray-400"
              >({{ ri.notes }})</span
            >
          </li>
        </ul>
      </RecipeIngredientList>

      <div v-if="recipe?.steps && recipe.steps.length > 0" class="max-w-4xl">
        <h2 class="mb-4 text-2xl text-pretty sm:text-3xl font-serif">Steps</h2>
        <div class="space-y-6 divide-y divide-gray-200">
          <RecipeStep
            v-for="(step, index) in recipe.steps"
            class="pb-6"
            :key="index + '-' + step.title"
            :index="index + 1"
            :title="step.title"
            :content="step.content"
          />
        </div>
      </div>

      <!-- Nutrition Section -->
      <div class="mt-6">
        <RecipeNutrition
          :recipe-id="recipeId"
          :servings="recipe?.servings ?? undefined"
        />
      </div>

      <USeparator class="mt-8" />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import type { ContentTocLink } from "@nuxt/ui/runtime/components/content/ContentToc.vue";
import { editRecipe as editRecipeAbility } from "~~/shared/utils/abilities";
import { formatIngredientLine } from "~~/shared/utils/formatIngredient";
import { formatEstimatedMinutes } from "~~/shared/utils/formatEstimatedMinutes";

const { seo } = useAppConfig();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const { loggedIn } = useUserSession();
const addingToList = ref(false);

definePageMeta({
  layout: "recipes",
});

const recipeId = Array.isArray(route.params.id)
  ? route.params.id[0]
  : route.params.id;

function localTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function addToTodayList() {
  if (!recipeId) {
    return;
  }

  if (!loggedIn.value) {
    await navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
    return;
  }

  addingToList.value = true;
  try {
    const date = localTodayIso();
    const list = await $fetch<{ id: string; listDate: string }>(
      "/api/shopping-lists/today",
      { query: { date } },
    );
    await $fetch(`/api/shopping-lists/${list.id}/recipes`, {
      method: "POST",
      body: { recipeIds: [recipeId] },
    });
    toast.add({
      title: "Added to shopping list",
      description: "Recipe added to today's list.",
      color: "success",
      actions: [
        {
          label: "Open list",
          onClick: () => navigateTo(`/shopping-list?date=${list.listDate}`),
        },
      ],
    });
  } catch (error: unknown) {
    toast.add({
      title: "Could not add recipe",
      description: error instanceof Error ? error.message : "Please try again.",
      color: "error",
    });
  } finally {
    addingToList.value = false;
  }
}

const {
  data: recipe,
  pending,
  error,
} = await useFetch(`/api/recipes/${recipeId}`);

if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Recipe not found",
  });
}

const timeLabel = computed(() =>
  formatEstimatedMinutes(recipe.value?.estimatedMinutes ?? null),
);

// Load recipe ingredients
const { data: recipeIngredients } = await useFetch(
  `/api/recipes/${recipeId}/ingredients`,
).catch(() => ({ value: [] }));

// Up to 10 recipes with overlapping tags (falls back to recent)
const { data: similarRecipes } = await useFetch(
  `/api/recipes/${recipeId}/similar`,
  { query: { limit: 10 } },
);
const navigation = computed(() => {
  if (!similarRecipes.value) return [];
  return similarRecipes.value.map((r: { id: string; title: string }) => ({
    title: r.title,
    to: `/recipes/${r.id}`,
  }));
});

const links = computed(() => {
  const result: ContentTocLink[] = [];

  if (recipeIngredients.value && recipeIngredients.value.length > 0) {
    result.push({
      id: "ingredients",
      depth: 1,
      text: "Ingredients",
    });
  }

  if (recipe.value?.steps && recipe.value.steps.length > 0) {
    result.push({
      id: "steps",
      depth: 2,
      text: "Steps",
      children: recipe.value.steps.map((step: any, index: number) => ({
        id: step.title.toLowerCase().replace(/\s/g, "-") || `step-${index}`,
        depth: 3,
        text: step.title || `Step ${index + 1}`,
      })),
    });
  }

  result.push({
    id: "nutrition",
    depth: 1,
    text: "Nutrition",
  });

  return result;
});

const handleDelete = async () => {
  if (!confirm("Are you sure you want to delete this recipe?")) {
    return;
  }

  try {
    await $fetch(`/api/recipes/${recipeId}`, {
      method: "DELETE",
    });
    await router.push("/");
  } catch (error: any) {
    console.error("Failed to delete recipe:", error);
    // TODO: Show error notification
  }
};

useSeoMeta({
  title: recipe.value?.title,
  ogTitle: `${recipe.value?.title} | ${seo?.siteName}`,
  description: recipe.value?.description,
  ogDescription: recipe.value?.description,
});

defineOgImage({
  component: "Recipe",
  title: recipe.value?.title,
  description: recipe.value?.description,
});
</script>
