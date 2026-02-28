import { createRecipe } from '~~/shared/utils/abilities'

export default defineNuxtRouteMiddleware(async () => {
  if (await denies(createRecipe)) {
    const { loggedIn } = useUserSession()
    return navigateTo(loggedIn.value ? '/' : '/login')
  }
})
