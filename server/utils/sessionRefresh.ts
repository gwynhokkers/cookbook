export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
export const SESSION_SLIDE_AFTER_SECONDS = 60 * 60 * 24

export type SessionRole = 'viewer' | 'editor' | 'admin'

export type SessionUser = {
  id: string
  name: string
  email: string
  image: string
  role: SessionRole
}

const ROLES: SessionRole[] = ['viewer', 'editor', 'admin']

export function toSessionUser(row: {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
}): SessionUser {
  const role = ROLES.includes(row.role as SessionRole)
    ? row.role as SessionRole
    : 'viewer'
  return {
    id: row.id,
    name: row.name || '',
    email: row.email,
    image: row.image || '',
    role
  }
}

export function shouldSlideSession(createdAt: number, now: number): boolean {
  return now - createdAt >= SESSION_SLIDE_AFTER_SECONDS * 1000
}

function sameUser(a: SessionUser, b: SessionUser): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.email === b.email
    && a.image === b.image
    && a.role === b.role
}

export function planSessionRefresh(input: {
  sealedUser: SessionUser | null
  dbUser: SessionUser | null
  createdAt: number
  now: number
}): { action: 'none' } | { action: 'clear' } | { action: 'reseal'; user: SessionUser; slide: boolean } {
  if (!input.sealedUser) return { action: 'none' }
  if (!input.dbUser) return { action: 'clear' }
  const slide = shouldSlideSession(input.createdAt, input.now)
  if (!slide && sameUser(input.sealedUser, input.dbUser)) return { action: 'none' }
  return { action: 'reseal', user: input.dbUser, slide }
}
