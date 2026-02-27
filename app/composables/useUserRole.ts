export function useUserRole() {
  const { user, loggedIn } = useUserSession()

  const role = computed(() => (user.value as Record<string, unknown>)?.role as string | undefined)
  const isEditor = computed(() => loggedIn.value && (role.value === 'editor' || role.value === 'admin'))
  const isAdmin = computed(() => loggedIn.value && role.value === 'admin')

  return { role, isEditor, isAdmin }
}
