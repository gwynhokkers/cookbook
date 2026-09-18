# Invite-only Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New accounts can be created only with a valid admin invite, or by a provider id listed in `ADMIN_GITHUB_IDS` or `ADMIN_GOOGLE_IDS`.

**Architecture:** Pure helpers own token hashing, invite validity, and the login decision. Drizzle stores invite hashes. Opening a link sets an httpOnly cookie; GitHub and Google callbacks both call one `completeOAuthLogin` that applies the decision. The admin page creates a link once and can revoke pending invites.

**Tech Stack:** Nuxt 4, Drizzle / D1, `nuxt-auth-utils`, Vitest, existing `manageUsers` ability.

**Spec:** `docs/superpowers/specs/2026-09-14-invite-only-login-design.md` (everything except the sliding-session hook, which is `docs/superpowers/plans/2026-09-14-sliding-sessions.md`).

This plan does not depend on the session plan. Do the session plan first if you want the logout fix before invites. Do not mix the two in one task.

## Global Constraints

- An invite is open and single-use. Admin chooses `viewer`, `editor`, or `admin`. Valid for 7 days from creation.
- Store the SHA-256 hex digest of the base64url token string (the URL token, not the decoded bytes). Never store or log the raw token.
- Return the URL only from `POST /api/invites`. Later reads do not include a token or URL.
- An existing user who signs in keeps their role, except a provider id in `ADMIN_GITHUB_IDS` or `ADMIN_GOOGLE_IDS` is promoted to `admin`. Do not spend their invite. Do not set role to `viewer` when linking a second provider.
- A new user needs a non-blank email. A blank email, including an env-admin id, does not insert a row and redirects to `/login?error=invite_required`. Do not add a second error code.
- Env-admin provider ids with a non-blank email can create an `admin` with no invite, and must not spend an invite cookie.
- Clear the invite cookie only after a new user is created from that invite.
- Two redeemers: the conditional `UPDATE` lets one win. The loser is uninvited.
- D1 has no interactive transaction. Claim with a conditional update, insert the user, and clear `used_at` if the insert throws. That is the rollback this database can do.
- Dev auth (`GET /auth/dev`) still skips the invite check and stays gated by `import.meta.dev`.
- Public recipe browsing stays open without an account.
- Do not email links, lock invites to an email, or store provider tokens.

## File map

| File | Responsibility |
|------|----------------|
| `server/utils/inviteToken.ts` | Hash, generate, expiry, unavailable reason, role check, pending check |
| `server/utils/oauthLoginDecision.ts` | Pure login decision |
| `server/utils/inviteRedeem.ts` | Claim, insert, release-on-failure |
| `server/utils/invites.ts` | Drizzle create, list, revoke, find, claim, release |
| `server/utils/oauthLogin.ts` | `completeOAuthLogin` used by both providers |
| `server/db/schema.ts` | `invites` table |
| `server/db/migrations/sqlite/` | Generated migration |
| `server/routes/invite/[token].get.ts` | Validate, set cookie, or redirect to unavailable |
| `app/pages/invite/unavailable.vue` | Explain missing, expired, used, revoked |
| `server/api/invites/*.ts` | Admin create, list, revoke; public current |
| `server/routes/auth/github.get.ts` | Call shared login after the profile fetch |
| `server/routes/auth/google.get.ts` | Same |
| `app/pages/admin/users.vue` | Create, copy once, revoke |
| `app/pages/login.vue` | Invite role hint and `invite_required` message |
| `tests/server/utils/inviteToken.test.ts` | Token and validity |
| `tests/server/utils/oauthLoginDecision.test.ts` | Login rules |
| `tests/server/utils/inviteRedeem.test.ts` | Claim / release |

---

### Task 1: Invite token helpers

**Files:**
- Create: `server/utils/inviteToken.ts`
- Test: `tests/server/utils/inviteToken.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `INVITE_COOKIE = 'cookbook-invite'`
  - `INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000`
  - `InviteRole = 'viewer' | 'editor' | 'admin'`
  - `hashInviteToken(token: string): Promise<string>`
  - `generateInviteToken(): string`
  - `inviteExpiresAt(createdAt: Date): Date`
  - `parseInviteRole(role: unknown): InviteRole | null`
  - `inviteUnavailableReason(invite, now): 'missing' | 'expired' | 'used' | 'revoked' | null`
  - `isPendingInvite(invite, now): boolean`
  - `unavailableCopy(reason: string | null | undefined): { title: string; description: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/server/utils/inviteToken.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  INVITE_COOKIE,
  INVITE_TTL_MS,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteUnavailableReason,
  isPendingInvite,
  parseInviteRole,
  unavailableCopy
} from '~~/server/utils/inviteToken'

describe('invite token', () => {
  it('uses a 7-day cookie name and lifetime', () => {
    expect(INVITE_COOKIE).toBe('cookbook-invite')
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('hashes the base64url string, not a second encoding', async () => {
    const token = 'abc'
    const hash = await hashInviteToken(token)
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hash).toHaveLength(64)
  })

  it('generates a url-safe token and an expiry 7 days out', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(token.length).toBeGreaterThan(20)
    const created = new Date('2026-09-14T00:00:00.000Z')
    expect(inviteExpiresAt(created).toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })

  it('accepts only viewer, editor, and admin', () => {
    expect(parseInviteRole('editor')).toBe('editor')
    expect(parseInviteRole('owner')).toBeNull()
    expect(parseInviteRole(undefined)).toBeNull()
  })
})

describe('inviteUnavailableReason', () => {
  const now = new Date('2026-09-14T00:00:00.000Z')
  const live = {
    expiresAt: new Date('2026-09-20T00:00:00.000Z'),
    usedAt: null,
    revokedAt: null
  }

  it('returns null when the invite can still be spent', () => {
    expect(inviteUnavailableReason(live, now)).toBeNull()
    expect(isPendingInvite(live, now)).toBe(true)
  })

  it('reports missing, revoked, used, then expired', () => {
    expect(inviteUnavailableReason(null, now)).toBe('missing')
    expect(inviteUnavailableReason({ ...live, revokedAt: now }, now)).toBe('revoked')
    expect(inviteUnavailableReason({ ...live, usedAt: now }, now)).toBe('used')
    expect(inviteUnavailableReason({
      ...live,
      expiresAt: new Date('2026-09-13T00:00:00.000Z')
    }, now)).toBe('expired')
  })

  it('does not treat an expired invite as pending', () => {
    expect(isPendingInvite({
      ...live,
      expiresAt: new Date('2026-09-13T00:00:00.000Z')
    }, now)).toBe(false)
  })
})

describe('unavailableCopy', () => {
  it('explains each reason and falls back to missing', () => {
    expect(unavailableCopy('expired').title).toBe('This invite has expired')
    expect(unavailableCopy('used').title).toBe('This invite has already been used')
    expect(unavailableCopy('revoked').title).toBe('This invite was revoked')
    expect(unavailableCopy('nope').title).toBe('This invite is not valid')
  })
})
```

The expected hash is SHA-256 of the UTF-8 string `abc`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/utils/inviteToken.test.ts`

Expected: FAIL with cannot find module `~~/server/utils/inviteToken`

- [ ] **Step 3: Write the implementation**

Create `server/utils/inviteToken.ts`:

```ts
import { randomBytes } from 'node:crypto'

export const INVITE_COOKIE = 'cookbook-invite'
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const INVITE_ROLES = ['viewer', 'editor', 'admin'] as const
export type InviteRole = typeof INVITE_ROLES[number]

export type InviteValidity = {
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function inviteExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + INVITE_TTL_MS)
}

export function parseInviteRole(role: unknown): InviteRole | null {
  if (typeof role !== 'string') return null
  return INVITE_ROLES.includes(role as InviteRole) ? role as InviteRole : null
}

export function inviteUnavailableReason(
  invite: InviteValidity | null,
  now: Date
): 'missing' | 'expired' | 'used' | 'revoked' | null {
  if (!invite) return 'missing'
  if (invite.revokedAt) return 'revoked'
  if (invite.usedAt) return 'used'
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired'
  return null
}

export function isPendingInvite(invite: InviteValidity, now: Date): boolean {
  return inviteUnavailableReason(invite, now) === null
}

export function unavailableCopy(reason: string | null | undefined): { title: string; description: string } {
  if (reason === 'expired') {
    return {
      title: 'This invite has expired',
      description: 'Ask an admin for a new link. Invites last 7 days.'
    }
  }
  if (reason === 'used') {
    return {
      title: 'This invite has already been used',
      description: 'If you already have an account, sign in. Otherwise ask an admin for a new link.'
    }
  }
  if (reason === 'revoked') {
    return {
      title: 'This invite was revoked',
      description: 'Ask an admin for a new link.'
    }
  }
  return {
    title: 'This invite is not valid',
    description: 'Ask an admin for a new link. If you already have an account, you can sign in.'
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tests/server/utils/inviteToken.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/inviteToken.ts tests/server/utils/inviteToken.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add invite token hashing and validity rules

EOF
)"
```

---

### Task 2: Login decision

**Files:**
- Create: `server/utils/oauthLoginDecision.ts`
- Test: `tests/server/utils/oauthLoginDecision.test.ts`

**Interfaces:**
- Consumes: `InviteRole` from Task 1
- Produces: `decideOAuthLogin(input): LoginDecision`

```ts
type OAuthProfile = {
  provider: 'github' | 'google'
  providerId: string
  email: string
  name: string
  image: string | null
}

type ExistingUser = {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
  githubId: string | null
  googleId: string | null
}

type LoginDecision =
  | {
      kind: 'sign-in'
      userId: string
      patch: {
        name: string
        image: string | null
        role: InviteRole
        githubId?: string
        googleId?: string
      }
      sessionUser: {
        id: string
        name: string
        email: string
        image: string
        role: InviteRole
      }
    }
  | { kind: 'create'; role: InviteRole; inviteId: string | null }
  | { kind: 'reject' }
```

`inviteId: null` on `create` means env-admin bootstrap. Do not spend an invite.

- [ ] **Step 1: Write the failing test**

Create `tests/server/utils/oauthLoginDecision.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decideOAuthLogin, type ExistingUser } from '~~/server/utils/oauthLoginDecision'

const profile = {
  provider: 'github' as const,
  providerId: '99',
  email: 'ada@example.com',
  name: 'Ada',
  image: 'https://example.com/a.png'
}

const existing: ExistingUser = {
  id: 'user-1',
  name: 'Old',
  email: 'ada@example.com',
  image: null,
  role: 'editor',
  githubId: null,
  googleId: null
}

describe('decideOAuthLogin', () => {
  it('signs in an existing user, attaches the provider, and does not consume the invite', () => {
    const decision = decideOAuthLogin({
      profile,
      existing,
      invite: { id: 'inv-1', role: 'admin' },
      isEnvAdmin: false
    })
    expect(decision).toEqual({
      kind: 'sign-in',
      userId: 'user-1',
      patch: {
        name: 'Ada',
        image: 'https://example.com/a.png',
        role: 'editor',
        githubId: '99'
      },
      sessionUser: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.com',
        image: 'https://example.com/a.png',
        role: 'editor'
      }
    })
  })

  it('promotes an existing env admin and still does not consume the invite', () => {
    const decision = decideOAuthLogin({
      profile,
      existing,
      invite: { id: 'inv-1', role: 'viewer' },
      isEnvAdmin: true
    })
    expect(decision.kind).toBe('sign-in')
    if (decision.kind === 'sign-in') expect(decision.patch.role).toBe('admin')
  })

  it('does not attach a provider id that is already set', () => {
    const decision = decideOAuthLogin({
      profile,
      existing: { ...existing, githubId: '99' },
      invite: null,
      isEnvAdmin: false
    })
    expect(decision.kind).toBe('sign-in')
    if (decision.kind === 'sign-in') expect(decision.patch.githubId).toBeUndefined()
  })

  it('rejects a new user with a blank email even if they are an env admin', () => {
    expect(decideOAuthLogin({
      profile: { ...profile, email: '  ' },
      existing: null,
      invite: { id: 'inv-1', role: 'editor' },
      isEnvAdmin: true
    })).toEqual({ kind: 'reject' })
  })

  it('creates an env admin without an invite id', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: { id: 'inv-1', role: 'viewer' },
      isEnvAdmin: true
    })).toEqual({ kind: 'create', role: 'admin', inviteId: null })
  })

  it('creates a new user at the invited role', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: { id: 'inv-1', role: 'editor' },
      isEnvAdmin: false
    })).toEqual({ kind: 'create', role: 'editor', inviteId: 'inv-1' })
  })

  it('rejects a new user with no spendable invite', () => {
    expect(decideOAuthLogin({
      profile,
      existing: null,
      invite: null,
      isEnvAdmin: false
    })).toEqual({ kind: 'reject' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/utils/oauthLoginDecision.test.ts`

Expected: FAIL with cannot find module `~~/server/utils/oauthLoginDecision`

- [ ] **Step 3: Write the implementation**

Create `server/utils/oauthLoginDecision.ts`:

```ts
import type { InviteRole } from './inviteToken'

export type OAuthProfile = {
  provider: 'github' | 'google'
  providerId: string
  email: string
  name: string
  image: string | null
}

export type ExistingUser = {
  id: string
  name: string | null
  email: string
  image: string | null
  role: string
  githubId: string | null
  googleId: string | null
}

export type LoginDecision =
  | {
      kind: 'sign-in'
      userId: string
      patch: {
        name: string
        image: string | null
        role: InviteRole
        githubId?: string
        googleId?: string
      }
      sessionUser: {
        id: string
        name: string
        email: string
        image: string
        role: InviteRole
      }
    }
  | { kind: 'create'; role: InviteRole; inviteId: string | null }
  | { kind: 'reject' }

function asRole(role: string): InviteRole {
  if (role === 'editor' || role === 'admin') return role
  return 'viewer'
}

export function decideOAuthLogin(input: {
  profile: OAuthProfile
  existing: ExistingUser | null
  invite: { id: string; role: InviteRole } | null
  isEnvAdmin: boolean
}): LoginDecision {
  const email = input.profile.email.trim()
  const image = input.profile.image

  if (input.existing) {
    const role: InviteRole = input.isEnvAdmin ? 'admin' : asRole(input.existing.role)
    const providerKey = input.profile.provider === 'github' ? 'githubId' : 'googleId'
    const alreadyLinked = Boolean(input.existing[providerKey])
    const patch: {
      name: string
      image: string | null
      role: InviteRole
      githubId?: string
      googleId?: string
    } = {
      name: input.profile.name,
      image,
      role
    }
    if (!alreadyLinked) {
      patch[providerKey] = input.profile.providerId
    }
    return {
      kind: 'sign-in',
      userId: input.existing.id,
      patch,
      sessionUser: {
        id: input.existing.id,
        name: input.profile.name || input.existing.name || email,
        email: input.existing.email,
        image: image || input.existing.image || '',
        role
      }
    }
  }

  if (!email) return { kind: 'reject' }
  if (input.isEnvAdmin) return { kind: 'create', role: 'admin', inviteId: null }
  if (input.invite) return { kind: 'create', role: input.invite.role, inviteId: input.invite.id }
  return { kind: 'reject' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tests/server/utils/oauthLoginDecision.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/oauthLoginDecision.ts tests/server/utils/oauthLoginDecision.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): decide signup from invite, existing user, or env admin

EOF
)"
```

---

### Task 3: Claim and release on failed insert

**Files:**
- Create: `server/utils/inviteRedeem.ts`
- Test: `tests/server/utils/inviteRedeem.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 except the idea of `inviteId: string | null`
- Produces: `redeemInviteAccount(input): Promise<'created' | 'unclaimed'>`

- [ ] **Step 1: Write the failing test**

Create `tests/server/utils/inviteRedeem.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { redeemInviteAccount } from '~~/server/utils/inviteRedeem'

describe('redeemInviteAccount', () => {
  it('inserts an env-admin account without claiming an invite', async () => {
    const claim = vi.fn()
    const insertUser = vi.fn().mockResolvedValue(undefined)
    const release = vi.fn()

    await expect(redeemInviteAccount({
      inviteId: null,
      claim,
      insertUser,
      release
    })).resolves.toBe('created')

    expect(claim).not.toHaveBeenCalled()
    expect(insertUser).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
  })

  it('does not insert when the claim loses the race', async () => {
    const insertUser = vi.fn()
    await expect(redeemInviteAccount({
      inviteId: 'inv-1',
      claim: vi.fn().mockResolvedValue(false),
      insertUser,
      release: vi.fn()
    })).resolves.toBe('unclaimed')
    expect(insertUser).not.toHaveBeenCalled()
  })

  it('releases the claim if the insert throws', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const error = new Error('unique email')
    await expect(redeemInviteAccount({
      inviteId: 'inv-1',
      claim: vi.fn().mockResolvedValue(true),
      insertUser: vi.fn().mockRejectedValue(error),
      release
    })).rejects.toBe(error)
    expect(release).toHaveBeenCalledWith('inv-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/utils/inviteRedeem.test.ts`

Expected: FAIL with cannot find module `~~/server/utils/inviteRedeem`

- [ ] **Step 3: Write the implementation**

Create `server/utils/inviteRedeem.ts`:

```ts
export async function redeemInviteAccount(input: {
  inviteId: string | null
  claim: (inviteId: string) => Promise<boolean>
  insertUser: () => Promise<void>
  release: (inviteId: string) => Promise<void>
}): Promise<'created' | 'unclaimed'> {
  if (input.inviteId) {
    const claimed = await input.claim(input.inviteId)
    if (!claimed) return 'unclaimed'
  }

  try {
    await input.insertUser()
    return 'created'
  } catch (error) {
    if (input.inviteId) await input.release(input.inviteId)
    throw error
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test tests/server/utils/inviteRedeem.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/inviteRedeem.ts tests/server/utils/inviteRedeem.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): release an invite claim when account creation fails

EOF
)"
```

---

### Task 4: Invites table

**Files:**
- Modify: `server/db/schema.ts` (after the `users` table, around line 40)
- Create: generated file under `server/db/migrations/sqlite/`
- Test: `tests/server/db/invites-schema.test.ts`

**Interfaces:**
- Consumes: `users` table
- Produces: `invites` drizzle table and `Invite` / `NewInvite` types

- [ ] **Step 1: Write the failing test**

Create `tests/server/db/invites-schema.test.ts`:

```ts
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { invites } from '~~/server/db/schema'

describe('invites schema', () => {
  it('stores a unique token hash, role, and spend timestamps', () => {
    const columns = getTableColumns(invites)
    expect(Object.keys(columns).sort()).toEqual([
      'createdAt',
      'createdBy',
      'expiresAt',
      'id',
      'revokedAt',
      'role',
      'tokenHash',
      'usedAt'
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test tests/server/db/invites-schema.test.ts`

Expected: FAIL because `invites` is not exported

- [ ] **Step 3: Add the table**

In `server/db/schema.ts`, after the `NewUser` type, add:

```ts
export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow()
})

export type Invite = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert
```

- [ ] **Step 4: Generate the migration**

Run: `npx nuxt db generate`

Expected: a new SQL file under `server/db/migrations/sqlite/` that creates `invites`. Do not hand-write that SQL. If the generator also rewrites unrelated SQL, stop and keep only the invites migration.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test tests/server/db/invites-schema.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.ts server/db/migrations/sqlite tests/server/db/invites-schema.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add invites table for single-use signup links

EOF
)"
```

---

### Task 5: Invite persistence

**Files:**
- Create: `server/utils/invites.ts`

**Interfaces:**
- Consumes: `hashInviteToken`, `generateInviteToken`, `inviteExpiresAt`, `parseInviteRole`, `isPendingInvite`, `InviteRole` from Task 1; `invites` from Task 4; `redeemInviteAccount` is not called here
- Produces:
  - `createInvite(createdBy: string, role: InviteRole): Promise<{ id: string; url: string; role: InviteRole; expiresAt: Date }>`
  - `listPendingInvites(now?: Date): Promise<Array<{ id: string; role: string; expiresAt: Date; createdAt: Date }>>`
  - `revokeInvite(id: string, now?: Date): Promise<boolean>`
  - `findSpendableInviteByToken(token: string, now?: Date): Promise<{ id: string; role: InviteRole; expiresAt: Date } | null>`
  - `claimInvite(id: string, now?: Date): Promise<boolean>`
  - `releaseInvite(id: string): Promise<void>`

This module imports `hub:db`. Do not import it from a unit test. Task 1 and Task 3 already cover the rules these functions apply.

- [ ] **Step 1: Confirm the helper tests still pass**

Run: `bun run test tests/server/utils/inviteToken.test.ts tests/server/utils/inviteRedeem.test.ts`

Expected: PASS

- [ ] **Step 2: Write the persistence helpers**

Create `server/utils/invites.ts`:

```ts
import { and, eq, isNull, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  isPendingInvite,
  type InviteRole
} from './inviteToken'

export async function createInvite(createdBy: string, role: InviteRole, origin: string) {
  const token = generateInviteToken()
  const id = nanoid()
  const createdAt = new Date()
  const expiresAt = inviteExpiresAt(createdAt)
  await db.insert(schema.invites).values({
    id,
    tokenHash: await hashInviteToken(token),
    role,
    createdBy,
    expiresAt,
    createdAt
  })
  return {
    id,
    url: `${origin}/invite/${token}`,
    role,
    expiresAt
  }
}

export async function listPendingInvites(now = new Date()) {
  const rows = await db.select({
    id: schema.invites.id,
    role: schema.invites.role,
    expiresAt: schema.invites.expiresAt,
    createdAt: schema.invites.createdAt,
    usedAt: schema.invites.usedAt,
    revokedAt: schema.invites.revokedAt
  }).from(schema.invites)

  return rows
    .filter(row => isPendingInvite(row, now))
    .map(({ id, role, expiresAt, createdAt }) => ({ id, role, expiresAt, createdAt }))
}

export async function revokeInvite(id: string, now = new Date()): Promise<boolean> {
  const row = await db.select()
    .from(schema.invites)
    .where(eq(schema.invites.id, id))
    .limit(1)
    .then(rows => rows[0])
  if (!row || !isPendingInvite(row, now)) return false

  await db.update(schema.invites)
    .set({ revokedAt: now })
    .where(eq(schema.invites.id, id))
  return true
}

export async function findSpendableInviteByToken(token: string, now = new Date()) {
  const tokenHash = await hashInviteToken(token)
  const row = await db.select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, tokenHash))
    .limit(1)
    .then(rows => rows[0])
  if (!row || !isPendingInvite(row, now)) return null
  return { id: row.id, role: row.role as InviteRole, expiresAt: row.expiresAt }
}

export async function claimInvite(id: string, now = new Date()): Promise<boolean> {
  const updated = await db.update(schema.invites)
    .set({ usedAt: now })
    .where(and(
      eq(schema.invites.id, id),
      isNull(schema.invites.usedAt),
      isNull(schema.invites.revokedAt),
      gt(schema.invites.expiresAt, now)
    ))
    .returning({ id: schema.invites.id })
  return updated.length > 0
}

export async function releaseInvite(id: string): Promise<void> {
  await db.update(schema.invites)
    .set({ usedAt: null })
    .where(eq(schema.invites.id, id))
}
```

If `.returning()` is not supported by the local driver, use the update and then select the row. A claim is successful only when that row's `usedAt` equals the `now` you just wrote. Do not treat "update did not throw" as success.

- [ ] **Step 3: Commit**

```bash
git add server/utils/invites.ts
git commit -m "$(cat <<'EOF'
feat(auth): persist hashed invites and claim them once

EOF
)"
```

---

### Task 6: Shared OAuth completion

**Files:**
- Create: `server/utils/oauthLogin.ts`
- Modify: `server/routes/auth/github.get.ts` (replace the find-or-create block starting at the admin-id lookup, about line 98, through `setUserSession`)
- Modify: `server/routes/auth/google.get.ts` (same, about line 83)

**Interfaces:**
- Consumes: `decideOAuthLogin`, `redeemInviteAccount`, `findSpendableInviteByToken`, `claimInvite`, `releaseInvite`, `INVITE_COOKIE`
- Produces: `completeOAuthLogin(event, profile): Promise<void>` which always redirects

- [ ] **Step 1: Confirm decision and redeem tests pass**

Run: `bun run test tests/server/utils/oauthLoginDecision.test.ts tests/server/utils/inviteRedeem.test.ts`

Expected: PASS

- [ ] **Step 2: Write the shared login**

Create `server/utils/oauthLogin.ts`:

```ts
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db, schema } from '../db'
import { claimInvite, findSpendableInviteByToken, releaseInvite } from './invites'
import { INVITE_COOKIE, parseInviteRole } from './inviteToken'
import { redeemInviteAccount } from './inviteRedeem'
import { decideOAuthLogin, type OAuthProfile } from './oauthLoginDecision'

function splitIds(value: string | undefined): string[] {
  return (value || '').split(',').map(part => part.trim()).filter(Boolean)
}

export async function completeOAuthLogin(
  event: Parameters<typeof getUserSession>[0],
  profile: OAuthProfile & { emailVerified: boolean }
) {
  const email = profile.email.trim()
  const providerColumn = profile.provider === 'github' ? schema.users.githubId : schema.users.googleId

  const existingByProvider = await db.select()
    .from(schema.users)
    .where(eq(providerColumn, profile.providerId))
    .limit(1)
    .then(rows => rows[0] ?? null)

  const existingByEmail = email
    ? await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
      .then(rows => rows[0] ?? null)
    : null

  const config = useRuntimeConfig(event)
  const adminIds = profile.provider === 'github'
    ? splitIds(config.adminGithubIds)
    : splitIds(config.adminGoogleIds)

  const cookie = getCookie(event, INVITE_COOKIE)
  const found = cookie ? await findSpendableInviteByToken(cookie) : null
  const invite = found && parseInviteRole(found.role)
    ? { id: found.id, role: parseInviteRole(found.role)! }
    : null

  const { emailVerified, ...decisionProfile } = profile
  const decision = decideOAuthLogin({
    profile: { ...decisionProfile, email },
    existing: existingByProvider ?? existingByEmail,
    invite,
    isEnvAdmin: adminIds.includes(profile.providerId)
  })

  if (decision.kind === 'reject') {
    return sendRedirect(event, '/login?error=invite_required')
  }

  if (decision.kind === 'sign-in') {
    await db.update(schema.users)
      .set({ ...decision.patch, updatedAt: new Date() })
      .where(eq(schema.users.id, decision.userId))
    await setUserSession(event, { user: decision.sessionUser })
    return sendRedirect(event, '/')
  }

  const userId = nanoid()
  const result = await redeemInviteAccount({
    inviteId: decision.inviteId,
    claim: claimInvite,
    insertUser: async () => {
      await db.insert(schema.users).values({
        id: userId,
        name: profile.name || email.split('@')[0],
        email,
        image: profile.image,
        emailVerified,
        role: decision.role,
        githubId: profile.provider === 'github' ? profile.providerId : null,
        googleId: profile.provider === 'google' ? profile.providerId : null
      })
    },
    release: releaseInvite
  })

  if (result === 'unclaimed') {
    return sendRedirect(event, '/login?error=invite_required')
  }

  if (decision.inviteId) {
    deleteCookie(event, INVITE_COOKIE)
  }

  await setUserSession(event, {
    user: {
      id: userId,
      name: profile.name || email.split('@')[0],
      email,
      image: profile.image || '',
      role: decision.role
    }
  })
  return sendRedirect(event, '/')
}
```

`decideOAuthLogin` does not take `emailVerified`. The destructure above keeps it off that call. Do not change the Task 2 tests.

- [ ] **Step 3: Call it from GitHub**

In `server/routes/auth/github.get.ts`, delete the block from `const config = useRuntimeConfig` used for admin ids through `setUserSession` (the second `useRuntimeConfig` and everything through the session set). Keep the token exchange and the email lookup. After `email` is resolved, add:

```ts
    const { completeOAuthLogin } = await import('../../utils/oauthLogin')
    return completeOAuthLogin(event, {
      provider: 'github',
      providerId: userResponse.id.toString(),
      email: email || '',
      name: userResponse.name || userResponse.login,
      image: userResponse.avatar_url,
      emailVerified: true
    })
```

Prefer a top-of-file import over a dynamic import:

```ts
import { completeOAuthLogin } from '../../utils/oauthLogin'
```

Remove unused imports (`eq`, `nanoid`, `db`, `schema`) if nothing else in the file uses them.

- [ ] **Step 4: Call it from Google**

In `server/routes/auth/google.get.ts`, delete the find-or-create and `setUserSession` block after the userinfo fetch. Call:

```ts
    return completeOAuthLogin(event, {
      provider: 'google',
      providerId: userResponse.id,
      email: userResponse.email || '',
      name: userResponse.name || (userResponse.email || '').split('@')[0],
      image: userResponse.picture || null,
      emailVerified: userResponse.verified_email
    })
```

Remove unused imports the same way.

- [ ] **Step 5: Run the decision tests**

Run: `bun run test tests/server/utils/oauthLoginDecision.test.ts tests/server/utils/inviteRedeem.test.ts tests/server/utils/inviteToken.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/utils/oauthLogin.ts server/routes/auth/github.get.ts server/routes/auth/google.get.ts
git commit -m "$(cat <<'EOF'
feat(auth): require an invite before creating an OAuth account

EOF
)"
```

---

### Task 7: Invite link and admin API

**Files:**
- Create: `server/routes/invite/[token].get.ts`
- Create: `app/pages/invite/unavailable.vue`
- Create: `server/api/invites/index.post.ts`
- Create: `server/api/invites/index.get.ts`
- Create: `server/api/invites/[id].delete.ts`
- Create: `server/api/invites/current.get.ts`

**Interfaces:**
- Consumes: Task 1 copy helpers, Task 5 persistence, `manageUsers`, `requireUserSession` (auto-imported)
- Produces: the HTTP routes in the spec

- [ ] **Step 1: Confirm token tests pass**

Run: `bun run test tests/server/utils/inviteToken.test.ts`

Expected: PASS

- [ ] **Step 2: Write the invite route**

Create `server/routes/invite/[token].get.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db'
import { INVITE_COOKIE, hashInviteToken, inviteUnavailableReason } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const tokenHash = await hashInviteToken(token)
  const row = token
    ? await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, tokenHash)).limit(1).then(rows => rows[0] ?? null)
    : null
  const now = new Date()
  const reason = inviteUnavailableReason(row ?? null, now)
  if (reason || !row) {
    return sendRedirect(event, `/invite/unavailable?reason=${reason || 'missing'}`)
  }

  const remainingSeconds = Math.max(1, Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000))
  setCookie(event, INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestURL(event).protocol === 'https:',
    maxAge: remainingSeconds
  })
  return sendRedirect(event, '/login')
})
```

Look the row up directly. `findSpendableInviteByToken` returns null for every failure reason, so it cannot tell a used link from a missing one.

- [ ] **Step 3: Write the unavailable page**

Create `app/pages/invite/unavailable.vue`:

```vue
<template>
  <UPage class="container mx-auto py-8 px-4">
    <UPageHeader :title="copy.title" :description="copy.description" />
    <UPageBody>
      <UButton to="/login">Sign in</UButton>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { unavailableCopy } from '~~/server/utils/inviteToken'

const route = useRoute()
const reason = typeof route.query.reason === 'string' ? route.query.reason : null
const copy = unavailableCopy(reason)
</script>
```

If importing a server util into a page pulls Node `crypto` into the client, move `unavailableCopy` to `shared/utils/inviteCopy.ts` and import that from both the server helper re-export and this page. Do that if the build complains. The strings in Task 1 must stay the ones this page shows.

- [ ] **Step 4: Write the API routes**

`server/api/invites/index.post.ts`:

```ts
import { manageUsers } from '~~/shared/utils/abilities'
import { createInvite } from '../../utils/invites'
import { parseInviteRole } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  const body = await readBody(event)
  const role = parseInviteRole(body?.role)
  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role. Must be one of: viewer, editor, admin' })
  }
  const session = await requireUserSession(event)
  const origin = getRequestURL(event).origin
  return createInvite(session.user.id, role, origin)
})
```

`server/api/invites/index.get.ts`:

```ts
import { manageUsers } from '~~/shared/utils/abilities'
import { listPendingInvites } from '../../utils/invites'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  return listPendingInvites()
})
```

`server/api/invites/[id].delete.ts`:

```ts
import { manageUsers } from '~~/shared/utils/abilities'
import { revokeInvite } from '../../../utils/invites'

export default defineEventHandler(async (event) => {
  await authorize(event, manageUsers)
  const id = getRouterParam(event, 'id')
  if (!id || !(await revokeInvite(id))) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }
  return { ok: true }
})
```

`server/api/invites/current.get.ts`:

```ts
import { findSpendableInviteByToken } from '../../utils/invites'
import { INVITE_COOKIE } from '../../utils/inviteToken'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, INVITE_COOKIE)
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'No invite' })
  }
  const invite = await findSpendableInviteByToken(token)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'No invite' })
  }
  return { role: invite.role, expiresAt: invite.expiresAt }
})
```

Check the relative import depth against a sibling route such as `server/api/users/[id]/role.put.ts` (`../../../db`). `[id].delete.ts` is the same depth as that file, so `../../../utils/invites` is correct. `index.post.ts` is one level shallower: `../../utils/invites`.

- [ ] **Step 5: Run helper tests**

Run: `bun run test tests/server/utils/inviteToken.test.ts tests/server/db/invites-schema.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/invite app/pages/invite server/api/invites
git commit -m "$(cat <<'EOF'
feat(auth): add invite links and admin invite API

EOF
)"
```

---

### Task 8: Admin and login screens

**Files:**
- Modify: `app/pages/admin/users.vue`
- Modify: `app/pages/login.vue`

**Interfaces:**
- Consumes: `POST /api/invites`, `GET /api/invites`, `DELETE /api/invites/:id`, `GET /api/invites/current`
- Produces: the screens in the spec

- [ ] **Step 1: Add the invite card and pending list**

In `app/pages/admin/users.vue`, inside `<UPageBody>`, after the role-permissions `UAlert` and before the user `UCard`, add:

```vue
        <UCard>
          <template #header>
            <p class="font-medium">Invite someone</p>
          </template>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <UFormField label="Permission" class="sm:w-48">
              <USelect v-model="inviteRole" :items="roleOptions" class="w-full" />
            </UFormField>
            <UButton :loading="creatingInvite" @click="createInvite">
              Create invite link
            </UButton>
          </div>
          <div v-if="createdInvite" class="mt-4 space-y-2">
            <p class="text-sm text-muted">
              Copy this link now. A refresh cannot recover it. Revoke and create another if you lose it.
            </p>
            <div class="flex gap-2">
              <UInput :model-value="createdInvite.url" readonly class="flex-1" />
              <UButton variant="outline" @click="copyInvite">Copy</UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <p class="font-medium">Pending invites</p>
          </template>
          <div v-if="!pendingInvites?.length" class="text-sm text-muted">
            No pending invites
          </div>
          <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
            <div
              v-for="invite in pendingInvites"
              :key="invite.id"
              class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <UBadge :color="roleBadgeColor(invite.role)" variant="subtle" size="sm">
                  {{ invite.role }}
                </UBadge>
                <p class="text-sm text-muted mt-1">
                  Expires {{ formatDate(invite.expiresAt) }}
                </p>
              </div>
              <UButton
                color="error"
                variant="ghost"
                :loading="revoking === invite.id"
                @click="revoke(invite.id)"
              >
                Revoke
              </UButton>
            </div>
          </div>
        </UCard>
```

In the script, add:

```ts
const inviteRole = ref('viewer')
const creatingInvite = ref(false)
const createdInvite = ref<{ url: string } | null>(null)
const revoking = ref<string | null>(null)

interface InviteRow {
  id: string
  role: string
  expiresAt: string
  createdAt: string
}

const { data: pendingInvites, refresh: refreshInvites } = await useFetch<InviteRow[]>('/api/invites', {
  credentials: 'include'
})

async function createInvite() {
  creatingInvite.value = true
  try {
    const created = await $fetch<{ url: string }>('/api/invites', {
      method: 'POST',
      body: { role: inviteRole.value },
      credentials: 'include'
    })
    createdInvite.value = created
    toast.add({ title: 'Invite created', color: 'success' })
    await refreshInvites()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create invite'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    creatingInvite.value = false
  }
}

async function copyInvite() {
  if (!createdInvite.value) return
  await navigator.clipboard.writeText(createdInvite.value.url)
  toast.add({ title: 'Link copied', color: 'success' })
}

async function revoke(id: string) {
  revoking.value = id
  try {
    await $fetch(`/api/invites/${id}`, { method: 'DELETE', credentials: 'include' })
    if (createdInvite.value) createdInvite.value = null
    toast.add({ title: 'Invite revoked', color: 'success' })
    await refreshInvites()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to revoke invite'
    toast.add({ title: 'Error', description: message, color: 'error' })
  } finally {
    revoking.value = null
  }
}
```

Do not clear `createdInvite` on every revoke if you can avoid hiding a link the admin just copied. Only clear it when the revoked id is the one just created. Track `createdInvite.id` from the POST response (`{ id, url, role, expiresAt }`) and clear only when `invite.id` matches.

- [ ] **Step 2: Update the login page**

In `app/pages/login.vue`, above the provider buttons, add:

```vue
        <UAlert
          v-if="inviteError"
          color="warning"
          icon="i-heroicons-exclamation-triangle"
          title="You need an invite from an admin"
          description="New accounts cannot be created from this page. If you already have an account, sign in below."
        />
        <UAlert
          v-else-if="joiningRole"
          color="info"
          icon="i-heroicons-ticket"
          :title="`You will join as ${joiningRole}`"
          description="Sign in with GitHub or Google to create your account."
        />
        <p v-else class="text-sm text-muted text-center">
          New accounts need an invite link from an admin. Existing accounts can sign in below.
        </p>
```

In the script:

```ts
const route = useRoute()
const inviteError = computed(() => route.query.error === 'invite_required')

const { data: currentInvite, error: inviteLookupError } = await useFetch<{ role: string }>('/api/invites/current', {
  credentials: 'include'
})

const joiningRole = computed(() => {
  if (inviteLookupError.value || !currentInvite.value) return null
  return currentInvite.value.role
})
```

Keep the existing redirect when `loggedIn` is already true.

- [ ] **Step 3: Run the helper tests**

Run: `bun run test tests/server/utils/inviteToken.test.ts tests/server/utils/oauthLoginDecision.test.ts tests/server/utils/inviteRedeem.test.ts tests/server/db/invites-schema.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/pages/admin/users.vue app/pages/login.vue
git commit -m "$(cat <<'EOF'
feat(auth): let admins copy an invite link and explain signup on login

EOF
)"
```

---

## Plan self-check

- Open single-use 7-day invite with a chosen role: Tasks 1, 4, 5, 8.
- URL shown once, hash stored: Tasks 1, 5, 8.
- Existing user does not spend the invite or lose their role: Task 2 sign-in tests, Task 6 applies that decision and does not delete the cookie.
- Second provider does not reset role to viewer: Task 2 attaches `githubId` only when empty and keeps `editor`.
- Env admin bootstrap does not spend an invite and still needs an email: Task 2 tests, Task 3 does not call `claim` when `inviteId` is null.
- Blank email rejects with `invite_required` only: Task 2.
- Race and failed insert: Task 3 plus conditional `claimInvite` in Task 5.
- Bad link never starts OAuth: Task 7 redirect to `/invite/unavailable`.
- Pending list omits used, expired, revoked, and never returns a token: Task 5 `listPendingInvites`.
- `manageUsers` on write and list: Task 7 `authorize`.
- Dev auth untouched: this plan does not edit `server/routes/auth/dev.get.ts`.
- Not in this plan: email delivery, email lock, provider refresh tokens, session sliding.
