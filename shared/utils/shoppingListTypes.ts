export const SHOPPING_LIST_AISLES = [
  'Produce',
  'Bakery',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Spices',
  'Beverages',
  'Other'
] as const

export type ShoppingListAisle = (typeof SHOPPING_LIST_AISLES)[number]

export type ShoppingListContribution = {
  recipeId: string
  title: string
  amount: string
  unit: string
  notes?: string | null
}

export type ShoppingListStatus = 'draft' | 'generated'

export type ShoppingListItemDto = {
  id: string
  listId: string
  ingredientId: string | null
  name: string
  totalAmount: string
  totalUnit: string
  displayAmount: string
  aisle: string | null
  packageSuggestion: string | null
  substitutionNote: string | null
  needsReview: boolean
  checked: boolean
  contributions: ShoppingListContribution[]
  sortOrder: number
}

export type ShoppingListRecipeDto = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
}

export type ShoppingListDto = {
  id: string
  userId: string
  listDate: string
  title: string | null
  status: ShoppingListStatus
  generatedAt: string | null
  createdAt: string
  updatedAt: string
  recipes: ShoppingListRecipeDto[]
  items: ShoppingListItemDto[]
  warning?: string | null
}

export type ShoppingListSummaryDto = {
  id: string
  listDate: string
  title: string | null
  status: ShoppingListStatus
  recipeCount: number
  itemCount: number
  updatedAt: string
}

export type AmalgamatedIngredient = {
  ingredientId: string | null
  name: string
  totalAmount: string
  totalUnit: string
  displayAmount: string
  needsReview: boolean
  contributions: ShoppingListContribution[]
}
