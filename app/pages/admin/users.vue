<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader
      title="Manage Users"
      description="Assign roles to control who can view and edit recipes"
    />

    <UPageBody>
      <div v-if="pending" class="text-center py-8">
        <p>Loading users...</p>
      </div>
      <div v-else-if="error">
        <UAlert
          color="error"
          title="Error"
          :description="error.message || 'Failed to load users'"
        />
      </div>
      <div v-else class="space-y-4">
        <UAlert
          color="info"
          variant="subtle"
          title="Role permissions"
          description="Viewer: can see all recipes when signed in. Editor: can create, edit, and delete recipes. Admin: full access including user management."
        />

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th class="px-4 py-3 text-left text-sm font-semibold">
                  User
                </th>
                <th class="px-4 py-3 text-left text-sm font-semibold">
                  Email
                </th>
                <th class="px-4 py-3 text-left text-sm font-semibold">
                  Role
                </th>
                <th class="px-4 py-3 text-left text-sm font-semibold">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr v-for="u in users" :key="u.id">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <UAvatar
                      :src="u.image || undefined"
                      :alt="u.name || u.email"
                      size="sm"
                    />
                    <span class="font-medium">{{ u.name || 'Unnamed' }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-sm text-muted">
                  {{ u.email }}
                </td>
                <td class="px-4 py-3">
                  <USelect
                    :model-value="u.role"
                    :items="roleOptions"
                    :disabled="updating === u.id"
                    @update:model-value="(val: string) => updateRole(u.id, val)"
                  />
                </td>
                <td class="px-4 py-3 text-sm text-muted">
                  {{ new Date(u.createdAt).toLocaleDateString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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

interface UserRow {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
  githubId: string | null
  createdAt: string
}

const { data: users, pending, error, refresh } = await useFetch<UserRow[]>('/api/users', {
  credentials: 'include'
})

const updateRole = async (userId: string, newRole: string) => {
  updating.value = userId
  try {
    await $fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      body: { role: newRole },
      credentials: 'include'
    })
    await refresh()
  } catch (err) {
    console.error('Failed to update role:', err)
  } finally {
    updating.value = null
  }
}
</script>
