<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Login"
      description="Sign in to create and manage recipes"
    />

    <UPageBody>
      <div class="max-w-md mx-auto space-y-4">
        <template v-if="devAuthEnabled">
          <div class="space-y-3">
            <p class="text-sm font-medium text-muted text-center">
              Development login
            </p>
            <UButton
              v-for="persona in devPersonas"
              :key="persona.key"
              block
              size="lg"
              :color="persona.color"
              :variant="persona.variant"
              @click="signInAsDev(persona.key)"
            >
              <UIcon :name="persona.icon" class="mr-2" />
              Sign in as {{ persona.label }}
            </UButton>
          </div>

          <div class="relative py-2">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-default" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-default px-2 text-muted">or</span>
            </div>
          </div>
        </template>

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
import type { DevAuthPersona } from '~~/shared/dev-auth-personas'

const config = useRuntimeConfig()
const devAuthEnabled = import.meta.dev && config.public.devAuth

const { loggedIn } = useUserSession()

if (loggedIn.value) {
  await navigateTo('/')
}

const devPersonas: Array<{
  key: DevAuthPersona
  label: string
  icon: string
  color: 'neutral' | 'primary' | 'error'
  variant: 'solid' | 'outline'
}> = [
  { key: 'viewer', label: 'Viewer', icon: 'i-heroicons-eye', color: 'neutral', variant: 'outline' },
  { key: 'editor', label: 'Editor', icon: 'i-heroicons-pencil-square', color: 'primary', variant: 'solid' },
  { key: 'admin', label: 'Admin', icon: 'i-heroicons-shield-check', color: 'error', variant: 'solid' }
]

const signInAsDev = (persona: DevAuthPersona) => {
  window.location.href = `/auth/dev?persona=${persona}`
}

const signInWithGitHub = () => {
  window.location.href = '/auth/github'
}

const signInWithGoogle = () => {
  window.location.href = '/auth/google'
}
</script>
