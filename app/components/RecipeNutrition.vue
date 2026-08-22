<template>
  <div v-if="nutrition" id="nutrition" class="max-w-md">
    <h2 class="text-lg text-muted mb-2">Nutrition</h2>

    <table class="w-full text-xs tabular-nums">
      <thead>
        <tr class="text-[11px] uppercase tracking-wide text-muted">
          <th class="py-1 pr-3 text-left font-medium" />
          <th class="py-1 px-2 text-right font-medium">
            Total ({{ nutrition.servings }} serving{{
              nutrition.servings !== 1 ? "s" : ""
            }})
          </th>
          <th class="py-1 pl-2 text-right font-medium">Per serving</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="row in nutrientRows" :key="row.key" class="text-muted">
          <td class="py-1 pr-3 text-left">{{ row.label }}</td>
          <td class="py-1 px-2 text-right text-highlighted">
            {{ formatNutrient(nutrition.total[row.key], row.unit) }}
          </td>
          <td class="py-1 pl-2 text-right text-highlighted">
            {{ formatNutrient(nutrition.perServing[row.key], row.unit) }}
          </td>
        </tr>
      </tbody>
    </table>

    <UCollapsible
      v-if="nutrition.ingredients.length > 0"
      class="mt-2 flex flex-col gap-1"
    >
      <UButton
        label="By ingredient"
        color="neutral"
        variant="ghost"
        size="xs"
        trailing-icon="i-heroicons-chevron-down"
        class="group -ml-2.5 text-muted"
        :ui="{
          trailingIcon:
            'group-data-[state=open]:rotate-180 transition-transform duration-200',
        }"
      />
      <template #content>
        <ul class="space-y-1.5 pt-1">
          <li
            v-for="ing in nutrition.ingredients"
            :key="ing.ingredientId"
            class="text-xs text-muted"
          >
            <span class="text-highlighted">
              {{ ing.ingredientName }} ({{ ing.amount }}{{ ing.unit }})
            </span>
            <span class="block">
              {{ formatNutrient(ing.nutrition.energyKcal, "kcal") }},
              {{ formatNutrient(ing.nutrition.proteins, "g") }} protein,
              {{ formatNutrient(ing.nutrition.carbohydrates, "g") }} carbs,
              {{ formatNutrient(ing.nutrition.fat, "g") }} fat
            </span>
          </li>
        </ul>
      </template>
    </UCollapsible>

    <p v-if="hasMissingData" class="mt-2 text-xs text-muted">
      Some ingredients are missing nutrition data.
    </p>
  </div>
  <div v-else id="nutrition" class="text-xs text-muted">
    No nutrition data available
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  recipeId: string;
  servings?: number;
}>();

const nutrition = ref<any>(null);

const nutrientRows = [
  { key: "energyKcal", label: "Energy", unit: "kcal" },
  { key: "proteins", label: "Protein", unit: "g" },
  { key: "carbohydrates", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugars", label: "Sugars", unit: "g" },
  { key: "salt", label: "Salt", unit: "g" },
] as const;

const hasMissingData = computed(() => {
  if (!nutrition.value) return false;
  return nutrition.value.ingredients.some(
    (ing: any) =>
      ing.nutrition.energyKcal === 0 &&
      ing.nutrition.proteins === 0 &&
      ing.nutrition.carbohydrates === 0,
  );
});

const formatNutrient = (value: number, unit: string) => {
  const rounded =
    unit === "kcal" ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${unit === "kcal" ? " kcal" : "g"}`;
};

const loadNutrition = async () => {
  try {
    const data = await $fetch(`/api/recipes/${props.recipeId}/nutrition`, {
      params: {
        servings: props.servings || 1,
      },
    });
    nutrition.value = data;
  } catch (error) {
    console.error("Failed to load nutrition:", error);
    nutrition.value = null;
  }
};

onMounted(() => {
  loadNutrition();
});

watch(
  () => props.servings,
  () => {
    loadNutrition();
  },
);
</script>
