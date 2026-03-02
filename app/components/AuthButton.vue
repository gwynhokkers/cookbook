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
        <div class="p-2 space-y-1">
          <div class="px-3 py-1.5 text-sm text-muted">
            Role:
            <UBadge :color="roleBadgeColor" size="xs" variant="subtle">
              {{ role || 'viewer' }}
            </UBadge>
          </div>
          <Can :ability="manageUsersAbility">
            <UButton
              variant="ghost"
              color="neutral"
              block
              to="/admin/users"
            >
              <UIcon name="i-heroicons-users" class="mr-2" />
              Manage Users
            </UButton>
          </Can>
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
import { manageUsers as manageUsersAbility } from '~~/shared/utils/abilities'

const { loggedIn, user, clear } = useUserSession()

const role = computed(() => (user.value as Record<string, unknown>)?.role as string | undefined)

const roleBadgeColor = computed(() => {
  if (role.value === 'admin') return 'error' as const
  if (role.value === 'editor') return 'primary' as const
  return 'neutral' as const
})

const handleSignOut = async () => {
  await clear()
  await navigateTo('/')
}
</script>
