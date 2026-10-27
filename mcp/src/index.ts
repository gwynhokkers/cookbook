import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../server/db/schema'
import { createOAuthWorker, type OAuthWorkerEnv } from './oauthWorker'

interface Env extends OAuthWorkerEnv {
  DB: D1Database
}

export default createOAuthWorker<Env>(env => drizzle(env.DB, { schema })) satisfies ExportedHandler<Env>
