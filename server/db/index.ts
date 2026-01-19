import * as schema from './schema'

// Import db directly from hub:db as per NuxtHub documentation
// @ts-ignore - hub:db is a virtual import resolved by NuxtHub
import { db } from 'hub:db'

// Re-export db and schema
export { db, schema }
