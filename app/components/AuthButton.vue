<template>
  <div>
    <UPopover
      v-if="loggedIn"
      :popper="{ placement: 'bottom-end' }"
    >
      <UUser
        :name="(user as any)?.name || (user as any)?.email || 'User'"
        :description="(user as any)?.email"
        :avatar="{
          src: (user as any)?.image,
          alt: (user as any)?.name || (user as any)?.email || 'User'
        }"
        class="cursor-pointer"
      />
      <template #content>
        <div class="p-2">
          <UButton
            variant="ghost"
            color="neutral"
            block
            @click="handleSignOut"
          >
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="mr-2" />
            Sign Out
          </UButton>
        </div>
      </template>
    </UPopover>
    <UButton
      v-else
      variant="ghost"
      to="/login"
    >
      <UIcon name="i-heroicons-arrow-right-on-rectangle" class="mr-2" />
      Sign In
    </UButton>
  </div>
</template>

<script setup lang="ts">
const { loggedIn, user, clear } = useUserSession()

const handleSignOut = async () => {
  await clear()
  await navigateTo('/')
}
</script>
