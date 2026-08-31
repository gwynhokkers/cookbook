export interface RecipeSummary {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  date: Date | number | null
  tags: string[] | null
  source: string | null
  visibility: string
  estimatedMinutes?: number | null
}

export interface PaginatedRecipes {
  items: RecipeSummary[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function emptyPaginatedRecipes(pageSize = 9): PaginatedRecipes {
  return {
    items: [],
    page: 1,
    pageSize,
    total: 0,
    totalPages: 0
  }
}
