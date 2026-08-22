<script setup lang="ts">
import { createRecipe, manageUsers as manageUsersAbility } from '~~/shared/utils/abilities'

const { header } = useAppConfig()
const { open: searchOpen } = useAppSearch()
const { loggedIn, user, clear } = useUserSession()
const menuOpen = ref(false)

const role = computed(() => (user.value as Record<string, unknown>)?.role as string | undefined)

const roleBadgeColor = computed(() => {
  if (role.value === 'admin') return 'error' as const
  if (role.value === 'editor') return 'primary' as const
  return 'neutral' as const
})

const userName = computed(() =>
  (user.value as Record<string, unknown>)?.name as string
  || (user.value as Record<string, unknown>)?.email as string
  || 'User'
)

const userEmail = computed(() => (user.value as Record<string, unknown>)?.email as string | undefined)

const userAvatar = computed(() => (user.value as Record<string, unknown>)?.image as string | undefined)

const menuButtonClass = 'w-full justify-start px-3'

function openSearch() {
  menuOpen.value = false
  searchOpen.value = true
}

async function handleSignOut() {
  menuOpen.value = false
  await clear()
  await navigateTo('/')
}
</script>

<template>
  <UHeader
    v-model:open="menuOpen"
    mode="slideover"
    :menu="{ side: 'right' }"
    :ui="{ body: 'flex flex-col p-0' }"
  >
    <template #title>
      <template v-if="header?.logo?.dark || header?.logo?.light">
        <UColorModeImage v-bind="{ class: 'h-6 w-auto', ...header?.logo }" />
      </template>
      <template v-else>
        <NuxtLink to="/" class="font-serif text-base sm:text-lg">
          Humboldt <span class="text-biolume-600">Kitchen</span>
        </NuxtLink>
      </template>
    </template>

    <template #default>
      <UButton
        icon="i-lucide-search"
        label="Search"
        variant="outline"
        color="neutral"
        class="hidden md:inline-flex"
        @click="openSearch"
      />
    </template>

    <template #right>
      <div class="hidden md:flex items-center gap-1">
        <UButton
          v-if="loggedIn"
          to="/humphry"
          icon="i-lucide-chef-hat"
          variant="ghost"
          color="neutral"
          aria-label="Ask Humphry"
        />
        <AuthButton />
        <UColorModeButton v-if="header?.colorMode" class="cursor-pointer" />
        <template v-if="header?.links">
          <UButton
            v-for="(link, index) of header.links"
            :key="index"
            v-bind="{ color: 'gray', variant: 'ghost', ...link }"
          />
        </template>
      </div>

      <UButton
        icon="i-lucide-search"
        variant="ghost"
        color="neutral"
        aria-label="Search recipes"
        class="md:hidden"
        @click="openSearch"
      />
    </template>

    <template #body>
      <div class="flex min-h-0 flex-1 flex-col">
        <nav class="flex flex-col gap-0.5 px-3 py-4">
          <p class="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted">
            Menu
          </p>

          <UButton
            :class="menuButtonClass"
            icon="i-lucide-search"
            variant="ghost"
            color="neutral"
            @click="openSearch"
          >
            Search recipes
          </UButton>
          <UButton
            :class="menuButtonClass"
            icon="i-lucide-home"
            variant="ghost"
            color="neutral"
            to="/"
          >
            Home
          </UButton>
          <UButton
            v-if="loggedIn"
            :class="menuButtonClass"
            icon="i-lucide-chef-hat"
            variant="ghost"
            color="neutral"
            to="/humphry"
          >
            Ask Humphry
          </UButton>
          <Can :ability="createRecipe">
            <UButton
              :class="menuButtonClass"
              icon="i-heroicons-plus"
              variant="ghost"
              color="neutral"
              to="/recipes/new"
            >
              Create recipe
            </UButton>
          </Can>
        </nav>

        <div class="mt-auto border-t border-default px-3 py-4">
          <div v-if="loggedIn" class="mb-3 flex items-center gap-3 px-3">
            <UAvatar
              :src="userAvatar"
              :alt="userName"
              size="md"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ userName }}
              </p>
              <p v-if="userEmail" class="truncate text-xs text-muted">
                {{ userEmail }}
              </p>
              <UBadge
                :color="roleBadgeColor"
                size="xs"
                variant="subtle"
                class="mt-1"
              >
                {{ role || 'viewer' }}
              </UBadge>
            </div>
          </div>

          <UButton
            v-else
            :class="menuButtonClass"
            icon="i-heroicons-arrow-right-on-rectangle"
            variant="soft"
            color="neutral"
            to="/login"
          >
            Sign in
          </UButton>

          <Can v-if="loggedIn" :ability="manageUsersAbility">
            <UButton
              :class="menuButtonClass"
              icon="i-heroicons-users"
              variant="ghost"
              color="neutral"
              to="/admin/users"
            >
              Manage users
            </UButton>
          </Can>

          <UButton
            v-if="loggedIn"
            :class="menuButtonClass"
            icon="i-heroicons-arrow-right-on-rectangle"
            variant="ghost"
            color="neutral"
            @click="handleSignOut"
          >
            Sign out
          </UButton>

          <div
            v-if="header?.colorMode"
            class="mt-3 flex items-center justify-between px-3 py-2"
          >
            <span class="text-sm text-muted">Theme</span>
            <UColorModeButton />
          </div>

          <div
            v-if="header?.links?.length"
            class="mt-3 flex items-center gap-1 px-3"
          >
            <UButton
              v-for="(link, index) of header.links"
              :key="`mobile-${index}`"
              variant="ghost"
              color="neutral"
              v-bind="link"
            />
          </div>
        </div>
      </div>
    </template>
  </UHeader>
</template>
