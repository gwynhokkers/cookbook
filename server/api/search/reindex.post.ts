import { rebuildRecipeSearchIndex } from '../../utils/recipeSearchIndex'

export default defineEventHandler(async (event) => {
  const authHeader = event.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET || 'migration-secret'}`) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const offset = query.offset != null ? Number(query.offset) : 0
  const limit = query.limit != null ? Number(query.limit) : undefined

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4744c8'},body:JSON.stringify({sessionId:'4744c8',runId:'reindex-524',hypothesisId:'A',location:'reindex.post.ts:entry',message:'reindex HTTP entry',data:{offset,limit:limit??null,batched:limit!=null},timestamp:Date.now()})}).catch(()=>{})
  // #endregion

  // Without limit, rebuild everything (may 524 on large cookbooks behind Cloudflare).
  // Prefer batched calls: ?limit=25&offset=0 then offset=nextOffset until done=true.
  const result = await rebuildRecipeSearchIndex({
    offset: Number.isFinite(offset) ? offset : 0,
    limit: limit != null && Number.isFinite(limit) ? limit : undefined
  })

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4744c8'},body:JSON.stringify({sessionId:'4744c8',runId:'reindex-524',hypothesisId:'D',location:'reindex.post.ts:exit',message:'reindex HTTP exit',data:{indexed:result.indexed,total:result.total,done:result.done,durationMs:(result as {durationMs?:number}).durationMs??null},timestamp:Date.now()})}).catch(()=>{})
  // #endregion

  return result
})
