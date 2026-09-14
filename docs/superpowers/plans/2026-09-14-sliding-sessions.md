# Sliding Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a signed-in user logged in for 7 days of activity, and make permission checks use the database role instead of the role sealed in the cookie.

**Architecture:** A pure function decides whether to clear, reseal, or leave a session. A Nitro request hook applies that decision, sliding `createdAt` when the session is at least a day old. The authorization resolver returns the database user from that same hook so a demotion applies on the next request. The cookie `maxAge` is 7 days. The client refetches the session on navigation so the header badge catches up.

**Tech Stack:** Nuxt 4, `nuxt-auth-utils`, h3 sealed cookies, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-invite-only-login-design.md` (Sessions section only).

## Global Constraints

- Session cookie and seal lifetime is `60 * 60 * 24 * 7` seconds (7 days) from `createdAt`.
- Extend the session only when its age is at least `60 * 60 * 24` seconds (1 day).
- Do not store or refresh GitHub or Google tokens.
- Do not add a server-side session table.
- Do not add an absolute lifetime beyond the 7-day idle window.
- Permission checks use the role on the user row, not the role in the cookie.
- Dev personas use this same sliding hook once they have a session.
- Do not change public recipe browsing.
- h3 does not move `createdAt` when session data is updated. Set `createdAt` on the h3 session object before `setUserSession` when sliding.

## File map

| File | Responsibility |
|------|----------------|
| `server/utils/sessionRefresh.ts` | Pure decision: none, clear, or reseal; session constants |
| `server/plugins/authorization-resolver.ts` | One request hook: refresh session, then resolve the database user |
| `nuxt.config.ts` | `runtimeConfig.session.maxAge` |
| `app/middleware/refresh-session.global.ts` | Client `fetch()` while logged in |
| `tests/server/utils/sessionRefresh.test.ts` | Decision tests |

Invite signup is a separate plan (`docs/superpowers/plans/2026-09-14-invite-only-signup.md`). Do not add invites in this plan.

---

### Task 1: Session refresh decision

**Files:**
- Create: `server/utils/sessionRefresh.ts`
- Test: `tests/server/utils/sessionRefresh.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `SESSION_MAX_AGE_SECONDS: number` — `604800`
  - `SESSION_SLIDE_AFTER_SECONDS: number` — `86400`
  - `SessionUser` — `{ id: string; name: string; email: string; image: string; role: 'viewer' | 'editor' | 'admin' }`
  - `planSessionRefresh(input: { sealedUser: SessionUser | null; dbUser: SessionUser | null; createdAt: number; now: number }): { action: 'none' } | { action: 'clear' } | { action: 'reseal'; user: SessionUser; slide: boolean }`
  - `shouldSlideSession(createdAt: number, now: number): boolean`
  - `toSessionUser(row: { id: string; name: string | null; email: string; image: string | null; role: string }): SessionUser`

- [ ] **Step 1: Write the failing test**

Create `tests/server/utils/sessionRefresh.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_SLIDE_AFTER_SECONDS,
  planSessionRefresh,
  toSessionUser,
  type SessionUser
} from '~~/server/utils/sessionRefresh'

const sealed: SessionUser = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  image: 'https://example.com/a.png',
  role: 'editor'
}

describe('session constants', () => {
  it('keeps a session for 7 days and slides after 1 day', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7)
    expect(SESSION_SLIDE_AFTER_SECONDS).toBe(60 * 60 * 24)
  })
})

describe('toSessionUser', () => {
  it('fills empty name and image and maps unknown roles to viewer', () => {
    expect(toSessionUser({
      id: 'user-1',
      name: null,
      email: 'ada@example.com',
      image: null,
      role: 'nope'
    })).toEqual({
      id: 'user-1',
      name: '',
      email: 'ada@example.com',
      image: '',
      role: 'viewer'
    })
  })
})

describe('planSessionRefresh', () => {
  const now = 1_700_000_000_000

  it('does nothing when there is no sealed user', () => {
    expect(planSessionRefresh({
      sealedUser: null,
      dbUser: sealed,
      createdAt: now,
      now
    })).toEqual({ action: 'none' })
  })

  it('clears the session when the user row is gone', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: null,
      createdAt: now,
      now
    })).toEqual({ action: 'clear' })
  })

  it('does nothing when the payload matches and the session is younger than 1 day', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: sealed,
      createdAt: now - (SESSION_SLIDE_AFTER_SECONDS * 1000) + 1,
      now
    })).toEqual({ action: 'none' })
  })

  it('reseals without sliding when the database role differs and the session is young', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: { ...sealed, role: 'viewer' },
      createdAt: now,
      now
    })).toEqual({
      action: 'reseal',
      user: { ...sealed, role: 'viewer' },
      slide: false
    })
  })

  it('slides when the session is at least 1 day old', () => {
    expect(planSessionRefresh({
      sealedUser: sealed,
      dbUser: sealed,
      createdAt: now - SESSION_SLIDE_AFTER_SECONDS * 1000,
      now
    })).toEqual({
      action: 'reseal',
      user: sealed,
      slide: true
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/utils/sessionRefresh.test.ts`

Expected: FAIL with cannot find module `~~/server/utils/sessionRefresh`

- [ ] **Step 3: Write the implementation**

Create `server/utils/sessionRefresh.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tests/server/utils/sessionRefresh.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/sessionRefresh.ts tests/server/utils/sessionRefresh.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): decide when a sealed session should slide or clear

EOF
)"
```

---

### Task 2: Apply refresh on each request and set cookie lifetime

**Files:**
- Modify: `server/plugins/authorization-resolver.ts`
- Modify: `nuxt.config.ts` (session block around lines 57–61)
- Create: `app/middleware/refresh-session.global.ts`

**Interfaces:**
- Consumes: `planSessionRefresh`, `toSessionUser`, `SESSION_MAX_AGE_SECONDS` from Task 1
- Produces: `resolveServerUser` returns the database user (or null). Cookie `maxAge` is 7 days. Logged-in client navigations call `useUserSession().fetch()`.

- [ ] **Step 1: Confirm Task 1 tests still pass**

Run: `bun run test tests/server/utils/sessionRefresh.test.ts`

Expected: PASS. This task is wiring. The decision tests are the behavior gate. Do not add a Nitro runtime test.

- [ ] **Step 2: Replace the authorization plugin**

Replace `server/plugins/authorization-resolver.ts` with:

```ts
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { planSessionRefresh, toSessionUser, type SessionUser } from '../utils/sessionRefresh'

const SESSION_NAME = 'nuxt-session'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const user = await refreshSessionUser(event)
    event.context.$authorization = {
      resolveServerUser: async () => user
    }
  })
})

async function refreshSessionUser(event: Parameters<typeof getUserSession>[0]): Promise<SessionUser | null> {
  const session = await getUserSession(event)
  const sealedUser = session.user
    ? toSessionUser({
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        role: session.user.role
      })
    : null

  if (!sealedUser) return null

  const row = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, sealedUser.id))
    .limit(1)
    .then(rows => rows[0])

  const dbUser = row ? toSessionUser(row) : null
  const stored = event.context.sessions?.[SESSION_NAME] as { createdAt?: number } | undefined
  const now = Date.now()
  const plan = planSessionRefresh({
    sealedUser,
    dbUser,
    createdAt: stored?.createdAt ?? now,
    now
  })

  if (plan.action === 'clear') {
    await clearUserSession(event)
    return null
  }

  if (plan.action === 'reseal') {
    if (plan.slide && stored) {
      stored.createdAt = now
    }
    await setUserSession(event, { user: plan.user })
  }

  return dbUser
}
```

`getUserSession`, `setUserSession`, and `clearUserSession` are auto-imported by `nuxt-auth-utils`. Do not import them.

- [ ] **Step 3: Set session maxAge**

In `nuxt.config.ts`, add the import at the top of the file (after the existing `isVitest` line):

```ts
import { SESSION_MAX_AGE_SECONDS } from "./server/utils/sessionRefresh";
```

Replace the `session` block so it includes `maxAge`:

```ts
    session: {
      maxAge: SESSION_MAX_AGE_SECONDS,
      password:
        process.env.NUXT_SESSION_PASSWORD ||
        "change-me-in-production-min-32-chars-long",
    },
```

- [ ] **Step 4: Refetch the client session on navigation**

Create `app/middleware/refresh-session.global.ts`:

```ts
export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch } = useUserSession()
  if (loggedIn.value) {
    await fetch()
  }
})
```

This only updates the header badge. The API already uses the database role from the plugin.

- [ ] **Step 5: Run the session tests**

Run: `bun run test tests/server/utils/sessionRefresh.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/plugins/authorization-resolver.ts nuxt.config.ts app/middleware/refresh-session.global.ts
git commit -m "$(cat <<'EOF'
feat(auth): slide login cookies and resolve roles from the database

EOF
)"
```

---

## Plan self-check

- 7-day `maxAge`: Task 1 constant, Task 2 config.
- Slide after 1 day by rewriting `createdAt`: Task 1 `slide: true`, Task 2 sets `stored.createdAt` before `setUserSession`.
- Missing user clears the session: Task 1 `clear`, Task 2 `clearUserSession`.
- Permission checks use the database role even when the cookie is stale: Task 2 returns `dbUser` from the resolver, including when the plan action is `none`.
- No provider tokens, no session table, no extra absolute cap.
- Dev sessions go through the same hook because they use `setUserSession`.
