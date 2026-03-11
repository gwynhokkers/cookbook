<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Login"
      description="Sign in to create and manage recipes"
    />

    <UPageBody>
      <div class="max-w-md mx-auto space-y-4">
        <UButton
          block
          size="lg"
          @click="signInWithGitHub"
        >
          <UIcon name="i-simple-icons-github" class="mr-2" />
          Sign in with GitHub
        </UButton>
        <UButton
          block
          size="lg"
          color="neutral"
          variant="outline"
          @click="signInWithGoogle"
        >
          <UIcon name="i-simple-icons-google" class="mr-2" />
          Sign in with Google
        </UButton>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
const { loggedIn } = useUserSession()

if (loggedIn.value) {
  await navigateTo('/')
}

const signInWithGitHub = () => {
  window.location.href = '/auth/github'
}

const signInWithGoogle = () => {
  window.location.href = '/auth/google'
}
</script>
