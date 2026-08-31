/**
 * @deprecated Prefer getWorkersAi(event).client() from `./workersAi`.
 * Thin re-export shim for existing call sites.
 */
import type { H3Event } from 'h3'
import { getWorkersAi } from './workersAi'

type AiEventLike = Parameters<typeof getWorkersAi>[0]

export async function getAIClient(event?: H3Event | AiEventLike) {
  return getWorkersAi(event).client()
}
