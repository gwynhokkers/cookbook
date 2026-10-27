import { db } from '../../db'
import { listTags } from '../../domain/recipes/facets'
import { getViewer } from '../../utils/viewer'

export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q || '')
  return { tags: await listTags(db, await getViewer(event), q) }
})
