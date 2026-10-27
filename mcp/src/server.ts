import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { CookbookDb } from '../../server/domain/recipes/types'
import { getRecipe } from '../../server/domain/recipes/getRecipe'
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

/** The tool error for a user whose connection lacks `scope` or whose role can't use it, or `null` if they may go ahead. */
function accessError(user: SignedInUser, scope: Scope) {
  const text = !user.scopes.includes(scope)
    ? `This connection doesn't have the ${scope} scope (${scopeDescriptions[scope].toLowerCase()}). Reconnect to Humboldt Kitchen and allow it.`
    : !scopeRoles[scope].includes(user.role)
        ? `Your Humboldt Kitchen role (${user.role}) can't use ${scope}.`
        : null
  return text ? { isError: true, content: [{ type: 'text' as const, text }] } : null
}

export function createCookbookMcpServer(db: CookbookDb, appOrigin: string, user: SignedInUser) {
  const server = new McpServer({ name: 'cookbook-mcp', version: '0.1.0' })

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
      const recipe = {
        ...found,
        imageUrl: found.imageUrl && new URL(found.imageUrl, appOrigin).href
      } satisfies z.infer<typeof recipeOutput>
      return {
        content: [{ type: 'text', text: JSON.stringify(recipe) }],
        structuredContent: recipe
      }
    }
  )

  return server
}
