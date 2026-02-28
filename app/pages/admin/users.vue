<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Manage Users"
      description="Assign roles to control who can view and edit recipes"
    />

    <UPageBody>
      <div v-if="pending" class="flex justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else-if="error">
        <UAlert
          color="error"
          icon="i-heroicons-exclamation-triangle"
          title="Failed to load users"
          :description="error.message"
        />
      </div>
      <div v-else-if="users" class="space-y-6">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-heroicons-information-circle"
          title="Role permissions"
        >
          <template #description>
            <ul class="mt-1 list-disc list-inside text-sm space-y-0.5">
              <li><strong>Viewer</strong> &mdash; can browse all recipes when signed in</li>
              <li><strong>Editor</strong> &mdash; can create, edit, and delete recipes</li>
              <li><strong>Admin</strong> &mdash; full access including user management</li>
            </ul>
          </template>
        </UAlert>

        <UCard>
          <div class="divide-y divide-gray-200 dark:divide-gray-800">
            <div
              v-for="u in users"
              :key="u.id"
              class="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
            >
              <UAvatar
                :src="u.image || undefined"
                :alt="u.name || u.email"
                size="lg"
              />

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium truncate">
                    {{ u.name || 'Unnamed' }}
                  </p>
                  <UBadge
                    v-if="u.isEnvAdmin"
                    color="warning"
                    variant="subtle"
                    size="xs"
                  >
                    <UIcon name="i-heroicons-lock-closed" class="mr-0.5 size-3" />
                    ENV
                  </UBadge>
                </div>
                <p class="text-sm text-muted truncate">
                  {{ u.email }}
                </p>
                <p class="text-xs text-muted mt-0.5">
                  Joined {{ formatDate(u.createdAt) }}
                </p>
              </div>

              <div class="flex items-center gap-3 shrink-0">
                <UBadge
                  :color="roleBadgeColor(u.role)"
                  variant="subtle"
                  size="sm"
                >
                  {{ u.role }}
                </UBadge>

                <UTooltip
                  v-if="u.isEnvAdmin"
                  text="Role is managed by ADMIN_GITHUB_IDS environment variable"
                >
                  <USelect
                    :model-value="u.role"
                    :items="roleOptions"
                    disabled
                    class="w-32 opacity-50"
                  />
                </UTooltip>
                <USelect
                  v-else
                  :model-value="u.role"
                  :items="roleOptions"
                  :disabled="updating === u.id"
                  :loading="updating === u.id"
                  class="w-32"
                  @update:model-value="(val: string) => updateRole(u.id, val)"
                />
              </div>
            </div>
          </div>

          <template v-if="!users.length" #default>
            <div class="text-center py-8 text-muted">
              <UIcon name="i-heroicons-users" class="size-8 mb-2" />
              <p>No users found</p>
            </div>
          </template>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { manageUsers } from '~~/shared/utils/abilities'

definePageMeta({
  middleware: 'auth'
})

if (await denies(manageUsers)) {
  await navigateTo('/')
}

const roleOptions = [
  { label: 'Viewer', value: 'viewer' },
  { label: 'Editor', value: 'editor' },
  { label: 'Admin', value: 'admin' }
]

const updating = ref<string | null>(null)
const toast = useToast()

interface UserRow {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
  githubId: string | null
  createdAt: string
  isEnvAdmin: boolean
}

const { data: users, pending, error, refresh } = await useFetch<UserRow[]>('/api/users', {
  credentials: 'include'
})

function roleBadgeColor(role: string) {
  if (role === 'admin') return 'error' as const
  if (role === 'editor') return 'primary' as const
  return 'neutral' as const
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

async function updateRole(userId: string, newRole: string) {
  updating.value = userId
  try {
    await $fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      body: { role: newRole },
      credentials: 'include'
    })
    toast.add({ title: 'Role updated', color: 'success' })
    await refresh()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update role'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    updating.value = null
  }
}
</script>
