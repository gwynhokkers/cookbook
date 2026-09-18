export type SitemapRecipe = {
  id: string
  visibility: string
  updatedAt: Date | string | number | null
}

export type SitemapUrl = {
  loc: string
  lastmod?: string
}

export function publicRecipeSitemapUrls(recipes: SitemapRecipe[]): SitemapUrl[] {
  return recipes
    .filter(recipe => recipe.visibility === 'public')
    .map((recipe) => {
      const lastmod = toLastmod(recipe.updatedAt)
      return lastmod
        ? { loc: `/recipes/${recipe.id}`, lastmod }
        : { loc: `/recipes/${recipe.id}` }
    })
}

export async function loadPublicRecipeSitemapUrls(
  load: () => Promise<SitemapRecipe[]>
): Promise<SitemapUrl[]> {
  try {
    return publicRecipeSitemapUrls(await load())
  } catch {
    return []
  }
}

function toLastmod(value: SitemapRecipe['updatedAt']): string | undefined {
  if (value == null || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}
