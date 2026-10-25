import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../server/db/schema'
import { createWorker } from './worker'

interface Env {
  DB: D1Database
  APP_ORIGIN: string
}

export default createWorker<Env>(env => drizzle(env.DB, { schema })) satisfies ExportedHandler<Env>
