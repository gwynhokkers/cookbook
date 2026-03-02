interface AppUser {
  id: string
  role: 'viewer' | 'editor' | 'admin'
}

export const viewAllRecipes = defineAbility((_user: AppUser) => true)

export const viewRecipe = defineAbility(
  { allowGuest: true },
  (_user: AppUser | null, recipe: { visibility: string }) => {
    if (recipe.visibility === 'public') return true
    return !!_user
  }
)

export const createRecipe = defineAbility((user: AppUser) => {
  return user.role === 'editor' || user.role === 'admin'
})

export const editRecipe = defineAbility((user: AppUser) => {
  return user.role === 'editor' || user.role === 'admin'
})

export const deleteRecipe = defineAbility((user: AppUser) => {
  return user.role === 'editor' || user.role === 'admin'
})

export const manageUsers = defineAbility((user: AppUser) => {
  return user.role === 'admin'
})
