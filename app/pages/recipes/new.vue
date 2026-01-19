<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Create New Recipe"
      description="Add a new recipe to your cookbook"
    />

    <UPageBody>
      <RecipeForm
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

const { loggedIn } = useUserSession()
const router = useRouter()

if (!loggedIn.value) {
  await navigateTo('/login')
}

const handleSubmit = async (data: any) => {
  try {
    const recipe = await $fetch('/api/recipes', {
      method: 'POST',
      body: data
    })
    
    await navigateTo(`/recipes/${recipe.id}`)
  } catch (error: any) {
    console.error('Failed to create recipe:', error)
    // TODO: Show error notification
  }
}

const handleCancel = () => {
  router.back()
}
</script>
