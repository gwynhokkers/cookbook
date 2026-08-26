import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// Recipe tables
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  source: text('source'),
  servings: integer('servings'),
  steps: text('steps', { mode: 'json' }).$type<Array<{ title: string; content: string }>>().default([]),
  visibility: text('visibility').notNull().default('public'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type Recipe = typeof recipes.$inferSelect
export type NewRecipe = typeof recipes.$inferInsert

// User table for nuxt-auth-utils
// nuxt-auth-utils stores session in cookies, but we can store user data in DB
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('viewer'),
  githubId: text('github_id').unique(),
  googleId: text('google_id').unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

// Ingredients table
export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  spoonacularIngredientId: text('spoonacular_ingredient_id'),
  spoonacularData: text('spoonacular_data', { mode: 'json' }).$type<any>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type Ingredient = typeof ingredients.$inferSelect
export type NewIngredient = typeof ingredients.$inferInsert

// Recipe ingredients junction table
export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  amount: text('amount').notNull(),
  unit: text('unit').notNull(),
  notes: text('notes'),
  order: text('order').notNull().default('0'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type NewRecipeIngredient = typeof recipeIngredients.$inferInsert

export const recipeFavorites = sqliteTable('recipe_favorites', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, (table) => [
  primaryKey({ columns: [table.userId, table.recipeId] })
])

export type RecipeFavorite = typeof recipeFavorites.$inferSelect
export type NewRecipeFavorite = typeof recipeFavorites.$inferInsert

export type ShoppingListContribution = {
  recipeId: string
  title: string
  amount: string
  unit: string
  notes?: string | null
}

export type ShoppingListStatus = 'draft' | 'generated'

export const shoppingLists = sqliteTable('shopping_lists', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listDate: text('list_date').notNull(),
  title: text('title'),
  status: text('status').$type<ShoppingListStatus>().notNull().default('draft'),
  generatedAt: integer('generated_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, table => [
  uniqueIndex('shopping_lists_user_date_uidx').on(table.userId, table.listDate),
  index('shopping_lists_user_id_idx').on(table.userId)
])

export type ShoppingList = typeof shoppingLists.$inferSelect
export type NewShoppingList = typeof shoppingLists.$inferInsert

export const shoppingListRecipes = sqliteTable('shopping_list_recipes', {
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  recipeId: text('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, table => [
  primaryKey({ columns: [table.listId, table.recipeId] })
])

export type ShoppingListRecipe = typeof shoppingListRecipes.$inferSelect
export type NewShoppingListRecipe = typeof shoppingListRecipes.$inferInsert

export const shoppingListItems = sqliteTable('shopping_list_items', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => shoppingLists.id, { onDelete: 'cascade' }),
  ingredientId: text('ingredient_id').references(() => ingredients.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  totalAmount: text('total_amount').notNull().default(''),
  totalUnit: text('total_unit').notNull().default(''),
  displayAmount: text('display_amount').notNull().default(''),
  aisle: text('aisle'),
  packageSuggestion: text('package_suggestion'),
  substitutionNote: text('substitution_note'),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
  contributions: text('contributions', { mode: 'json' })
    .$type<ShoppingListContribution[]>()
    .notNull()
    .default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, table => [
  index('shopping_list_items_list_id_idx').on(table.listId)
])

export type ShoppingListItem = typeof shoppingListItems.$inferSelect
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert

export const humphryChatSessions = sqliteTable('humphry_chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New chat'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, table => [
  index('humphry_chat_sessions_user_last_idx').on(table.userId, table.lastMessageAt)
])

export type HumphryChatSession = typeof humphryChatSessions.$inferSelect
export type NewHumphryChatSession = typeof humphryChatSessions.$inferInsert

export const humphryChatMessages = sqliteTable('humphry_chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => humphryChatSessions.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull(),
  role: text('role').notNull(),
  parts: text('parts', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
  searchText: text('search_text').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
}, table => [
  index('humphry_chat_messages_session_created_idx').on(table.sessionId, table.createdAt),
  uniqueIndex('humphry_chat_messages_session_message_uidx').on(table.sessionId, table.messageId)
])

export type HumphryChatMessage = typeof humphryChatMessages.$inferSelect
export type NewHumphryChatMessage = typeof humphryChatMessages.$inferInsert
