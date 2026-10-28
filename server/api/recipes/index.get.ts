import { db } from '../../db'
import { listRecipes } from '../../domain/recipes/listRecipes'
import { parsePaginationQuery } from '../../utils/pagination'
import { getViewer } from '../../utils/viewer'

export default defineEventHandler(async (event) => {
  const pagination = parsePaginationQuery(getQuery(event), 9)
  return listRecipes(db, await getViewer(event), pagination)
})
