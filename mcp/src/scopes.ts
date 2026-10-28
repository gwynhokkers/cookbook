export const scopeDescriptions = {
  'recipes:read': 'Read recipes, their tags and sources',
  'recipes:write': 'Create, edit and delete recipes',
  'favorites:write': 'Add and remove your favourite recipes',
  'shopping:read': 'Read your shopping lists',
  'shopping:write': 'Change your shopping lists'
} as const

export type Scope = keyof typeof scopeDescriptions

export const supportedScopes = Object.keys(scopeDescriptions) as Scope[]

const everyone = ['viewer', 'editor', 'admin']

// Keep in step with shared/utils/abilities.ts: only editors and admins may change recipes.
/** The roles allowed to use each scope. A grant can hold a scope the user's current role doesn't allow. */
export const scopeRoles: Record<Scope, readonly string[]> = {
  'recipes:read': everyone,
  'recipes:write': ['editor', 'admin'],
  'favorites:write': everyone,
  'shopping:read': everyone,
  'shopping:write': everyone
}

const isScope = (scope: string): scope is Scope => scope in scopeDescriptions

/** The scopes a grant gets for a client's request: the supported ones it asked for, or `recipes:read` if none. */
export function scopesToGrant(requested: string[]): Scope[] {
  const known = supportedScopes.filter(scope => requested.includes(scope))
  return known.length ? known : ['recipes:read']
}

/** Narrows stored grant scopes to known ones; a grant from before scopes existed has none. */
export function grantedScopes(stored: unknown): Scope[] {
  return Array.isArray(stored) ? stored.filter((scope): scope is Scope => typeof scope === 'string' && isScope(scope)) : []
}
