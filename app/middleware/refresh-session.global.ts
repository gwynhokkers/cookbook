export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch } = useUserSession()
  if (loggedIn.value) {
    await fetch()
  }
})
