<template>
  <UButton
    :icon="isFavorited ? 'i-heroicons-heart-solid' : 'i-heroicons-heart'"
    :color="isFavorited ? 'error' : 'neutral'"
    variant="soft"
    size="xs"
    :aria-label="isFavorited ? 'Remove from favourites' : 'Add to favourites'"
    :loading="pending"
    class="rounded-full"
    @click.stop.prevent="handleClick"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  recipeId: string
}>()

const emit = defineEmits<{
  'update:favorited': [value: boolean]
}>()

const { loggedIn } = useUserSession()
const { isFavorite, toggleFavorite } = useRecipeFavorites()

const pending = ref(false)
const isFavorited = computed(() => isFavorite(props.recipeId))

async function handleClick() {
  if (!loggedIn.value) {
    await navigateTo(`/login?redirect=${encodeURIComponent(useRoute().fullPath)}`)
    return
  }

  pending.value = true
  try {
    const next = await toggleFavorite(props.recipeId)
    emit('update:favorited', next)
  } finally {
    pending.value = false
  }
}
</script>
