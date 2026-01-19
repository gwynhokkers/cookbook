// Database is automatically initialized by NuxtHub via hub:db
// This plugin is kept for potential future database initialization logic
export default defineNitroPlugin(async (nitroApp) => {
  // Database is available via hub:db import in server/db/index.ts
  // NuxtHub handles initialization automatically
  console.log('✓ Database will be initialized by NuxtHub when needed')
})
