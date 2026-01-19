<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Edit Recipe"
      description="Update your recipe"
    />

    <UPageBody>
      <div v-if="pending">
        Loading...
      </div>
      <RecipeForm
        v-else-if="recipe"
        :recipe="recipe"
        :is-edit="true"
        @submit="handleSubmit"
        @cancel="handleCancel"
      />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const router = useRouter()
const { loggedIn } = useUserSession()

if (!loggedIn.value) {
  await navigateTo('/login')
}

const { data: recipe, pending, refresh } = await useFetch(`/api/recipes/${route.params.id}`)

if (!recipe.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Recipe not found'
  })
}

const handleSubmit = async (data: any) => {
  try {
    await $fetch(`/api/recipes/${route.params.id}`, {
      method: 'PUT',
      body: data
    })
    
    await refresh()
    await navigateTo(`/recipes/${route.params.id}`)
  } catch (error: any) {
    console.error('Failed to update recipe:', error)
    // TODO: Show error notification
  }
}

const handleCancel = () => {
  router.back()
}
</script>
