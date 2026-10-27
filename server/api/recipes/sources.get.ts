import { db } from '../../db'
import { listSources } from '../../domain/recipes/facets'
import { getViewer } from '../../utils/viewer'

export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '')
  return { sources: await listSources(db, await getViewer(event), q) }
})
