export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, fetch } = useUserSession()
  if (import.meta.client && loggedIn.value) {
    fetch().catch(() => {})
  }
})
