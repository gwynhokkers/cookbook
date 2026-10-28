import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { CookbookDb } from '../../server/domain/recipes/types'
import { getRecipe } from '../../server/domain/recipes/getRecipe'
import { searchRecipes, type SearchRecipesOptions } from '../../server/domain/recipes/search'
import { listSources, listTags } from '../../server/domain/recipes/facets'
import { DIET_TAGS } from '../../shared/utils/dietTags'
import { TIME_FILTER_VALUES, type RecipeSearchFilters } from '../../shared/utils/recipeSearchFilters'
import { scopeDescriptions, scopeRoles, type Scope } from './scopes'
import type { SignedInUser } from './signedInUser'

const recipeOutput = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  tags: z.array(z.string()),
  servings: z.number().nullable(),
  estimatedMinutes: z.number().nullable(),
  source: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  ingredients: z.array(z.object({
    name: z.string(),
    amount: z.string(),
    unit: z.string(),
    notes: z.string().nullable()
  })),
  steps: z.array(z.object({ title: z.string(), content: z.string() }))
})

const recipePageOutput = z.object({
  recipes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    tags: z.array(z.string()),
    source: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    visibility: z.string(),
    estimatedMinutes: z.number().nullable(),
    matchedOn: z.array(z.string()).describe('Where the query matched, such as title, ingredient or tag; empty when listing'),
    snippet: z.string()
  })),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number()
})

/** The tool error for a user whose connection lacks `scope` or whose role can't use it, or `null` if they may go ahead. */
function accessError(user: SignedInUser, scope: Scope) {
  const text = !user.scopes.includes(scope)
    ? `This connection doesn't have the ${scope} scope (${scopeDescriptions[scope].toLowerCase()}). Reconnect to Humboldt Kitchen and allow it.`
    : !scopeRoles[scope].includes(user.role)
        ? `Your Humboldt Kitchen role (${user.role}) can't use ${scope}.`
        : null
  return text ? { isError: true, content: [{ type: 'text' as const, text }] } : null
}

const trimmedList = z.array(z.string()).transform(values => values.map(value => value.trim()).filter(Boolean))

const pageAndFilterInput = {
  page: z.number().int().min(1).optional().describe('Page number, starting at 1'),
  tags: trimmedList.optional().describe('Only recipes with any of these tags (see list_tags)'),
  sources: trimmedList.optional().describe('Only recipes from any of these sources, matched exactly (see list_sources)'),
  diet: z.array(z.string().toLowerCase().pipe(z.enum(DIET_TAGS))).optional().describe('Only recipes with any of these diets'),
  time: z.enum(TIME_FILTER_VALUES).optional().describe('Only recipes whose estimated time, in minutes, is in this band')
}

function toFilters({ tags, sources, diet, time }: Partial<{ [K in keyof RecipeSearchFilters]: NonNullable<RecipeSearchFilters[K]> }>): RecipeSearchFilters {
  return { tags: tags ?? [], sources: sources ?? [], diet: diet ?? [], time: time ?? null }
}

function toolResult<T extends Record<string, unknown>>(value: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }
}

export function createCookbookMcpServer(db: CookbookDb, appOrigin: string, user: SignedInUser) {
  const server = new McpServer({ name: 'cookbook-mcp', version: '0.1.0' })
  const absoluteImageUrl = (imageUrl: string | null) => imageUrl && new URL(imageUrl, appOrigin).href

  async function recipePage(options: SearchRecipesOptions) {
    const { items, page, pageSize, total, totalPages } = await searchRecipes(db, user, options)
    const recipes = items.map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      imageUrl: absoluteImageUrl(recipe.imageUrl),
      tags: recipe.tags,
      source: recipe.source,
      sourceUrl: recipe.sourceUrl ?? null,
      visibility: recipe.visibility,
      estimatedMinutes: recipe.estimatedMinutes ?? null,
      matchedOn: recipe.matchedOn,
      snippet: recipe.snippet ?? recipe.title
    }))
    return toolResult({ recipes, page, pageSize, total, totalPages } satisfies z.infer<typeof recipePageOutput>)
  }

  server.registerTool(
    'search_recipes',
    {
      description: 'Search Humboldt Kitchen recipes by keywords, ingredients, tags, sources or recipe names, best match first. Returns 12 per page.',
      inputSchema: z.object({
        query: z.string().trim().min(2).describe('Search terms, at least two characters'),
        ...pageAndFilterInput
      }),
      outputSchema: recipePageOutput,
      annotations: { readOnlyHint: true }
    },
    async ({ query, page, ...filters }) => {
      const denied = accessError(user, 'recipes:read')
      if (denied) return denied
      return recipePage({ query, page, filters: toFilters(filters) })
    }
  )

  server.registerTool(
    'list_recipes',
    {
      description: 'List Humboldt Kitchen recipes, newest first, optionally filtered by tag, source, diet or time. Returns 12 per page.',
      inputSchema: z.object(pageAndFilterInput),
      outputSchema: recipePageOutput,
      annotations: { readOnlyHint: true }
    },
    async ({ page, ...filters }) => {
      const denied = accessError(user, 'recipes:read')
      if (denied) return denied
      return recipePage({ page, filters: toFilters(filters) })
    }
  )

  server.registerTool(
    'list_tags',
    {
      description: 'List the tags used on Humboldt Kitchen recipes, alphabetically (up to 100). Diet tags are left out; filter those with the diet option instead.',
      inputSchema: z.object({
        q: z.string().optional().describe('Only tags containing this text, ignoring case')
      }),
      outputSchema: z.object({ tags: z.array(z.string()) }),
      annotations: { readOnlyHint: true }
    },
    async ({ q }) => {
      const denied = accessError(user, 'recipes:read')
      if (denied) return denied
      return toolResult({ tags: await listTags(db, user, q) })
    }
  )

  server.registerTool(
    'list_sources',
    {
      description: 'List the sources (books, sites, people) of Humboldt Kitchen recipes, alphabetically (up to 50).',
      inputSchema: z.object({
        q: z.string().optional().describe('Only sources containing this text, ignoring case')
      }),
      outputSchema: z.object({ sources: z.array(z.string()) }),
      annotations: { readOnlyHint: true }
    },
    async ({ q }) => {
      const denied = accessError(user, 'recipes:read')
      if (denied) return denied
      return toolResult({ sources: await listSources(db, user, q) })
    }
  )

  server.registerTool(
    'get_recipe',
    {
      description: 'Get one Humboldt Kitchen recipe by id, with its ingredients (in order) and steps.',
      inputSchema: z.object({
        recipeId: z.string().min(1).describe('The recipe id')
      }),
      outputSchema: recipeOutput,
      annotations: { readOnlyHint: true }
    },
    async ({ recipeId }) => {
      const denied = accessError(user, 'recipes:read')
      if (denied) return denied
      const found = await getRecipe(db, recipeId, user)
      if (!found) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Recipe not found: ${recipeId}` }]
        }
      }
      return toolResult({ ...found, imageUrl: absoluteImageUrl(found.imageUrl) } satisfies z.infer<typeof recipeOutput>)
    }
  )

  return server
}
