export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn } = useUserSession()
  const { isEditor } = useUserRole()

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  if (!isEditor.value) {
    return navigateTo('/')
  }
})
