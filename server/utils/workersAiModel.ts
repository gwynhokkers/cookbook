/**
 * @deprecated Prefer getWorkersAi(event).languageModel(modelId) from `./workersAi`.
 * Thin re-export shim for existing call sites.
 */
import type { H3Event } from 'h3'
import { getWorkersAi } from './workersAi'

export function getWorkersAiModel(event: H3Event, modelId: string) {
  return getWorkersAi(event).languageModel(modelId)
}
