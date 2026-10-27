import type { H3Event } from 'h3'
import { viewAllRecipes } from '~~/shared/utils/abilities'
import type { Viewer } from '../domain/recipes/types'

/** The request's user as a recipe viewer: signed in only if the `viewAllRecipes` ability allows it. */
export async function getViewer(event: H3Event): Promise<Viewer> {
  if (!(await allows(event, viewAllRecipes))) return null
  const user = await event.context.$authorization.resolveServerUser() as { id: string }
  return { id: user.id }
}
