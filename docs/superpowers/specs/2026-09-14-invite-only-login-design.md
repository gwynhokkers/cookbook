# Invite-only signup and sliding sessions

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Admin-created invite links required for new accounts; 7-day sliding login sessions; role always read from the database

## Problem

1. Anyone who finishes GitHub or Google OAuth gets an account. There is no invite step.
2. Linking a second provider onto an existing email overwrites that user's role to `viewer` unless they are an env admin.
3. The session cookie has no `maxAge`, so browsers treat it as a session cookie and drop it after about a day of inactivity.
4. The role used for permission checks is the copy sealed into the cookie at login. An admin demotion does not apply until the next login.

## Goals

- A new account can be created only with a valid admin invite, or when the provider id is listed in `ADMIN_GITHUB_IDS` or `ADMIN_GOOGLE_IDS`.
- An invite is an open, single-use link. The admin chooses `viewer`, `editor`, or `admin`. The link is valid for 7 days.
- An existing user who opens an invite is signed in with their current role. The invite stays unused.
- A signed-in session lasts 7 days from the last extension. Each visit after the session is at least 1 day old extends it by another 7 days. Idle for 7 days and the session ends.
- Permission checks use the role stored on the user row, not the role sealed in the cookie.
- Dev personas remain a local-only bypass of the invite gate.

## Non-goals

- Emailing invite links.
- Locking an invite to an email address.
- Storing or refreshing GitHub or Google access tokens. Those tokens are discarded after the profile is read.
- Server-side session rows, sign-out-everywhere, or an absolute lifetime beyond the 7-day idle window.
- Changing who may browse public recipes. Browsing stays open without an account.
- Changing role abilities (`viewer` / `editor` / `admin`) themselves.

## Decisions

| Question | Choice |
|----------|--------|
| Who can use an invite link | Open, single-use. First new account to finish OAuth claims it |
| Existing user opens an invite | Sign them in with their current role. Do not spend the invite |
| Invite lifetime | 7 days from creation |
| How the link is delivered | Copy once from the admin page. No email |
| Lost link | Revoke and create another. The URL cannot be recovered |
| Session lifetime | Sliding 7-day idle timeout. Extend when the session is at least 1 day old |
| Provider refresh tokens | Do not use them |
| Approach | Invite cookie through OAuth, sealed `nuxt-auth-utils` session |

## Invite

An invite is a row an admin creates. The raw token is 32 cryptographically random bytes, encoded as base64url. The database stores the SHA-256 hex digest of that base64url string (the URL token, not the decoded bytes), never the raw token. The link is `{origin}/invite/{token}`.

The token is returned only in the create response. After the admin leaves that page, the URL cannot be reconstructed. They revoke and create another.

### Schema

Add `invites` to `server/db/schema.ts` and generate a Drizzle migration (`npx nuxt db generate`). Do not hand-write the SQL.

| Column | Type | Notes |
|--------|------|--------|
| `id` | text pk | nanoid |
| `token_hash` | text, unique, not null | SHA-256 hex of the base64url token string |
| `role` | text, not null | `viewer`, `editor`, or `admin` |
| `created_by` | text, nullable fk → `users.id` | `onDelete: set null` |
| `expires_at` | timestamp ms, not null | `created_at` + 7 days |
| `used_at` | timestamp ms, nullable | set when a new account is created from this invite |
| `revoked_at` | timestamp ms, nullable | set by revoke |
| `created_at` | timestamp ms, not null | default now |

An invite is spendable only when `used_at` is null, `revoked_at` is null, and `expires_at` is in the future.

### Cookie

Name: `cookbook-invite`.

HttpOnly, `SameSite=Lax`, `Path=/`. `Secure` on HTTPS; omit `Secure` on plain HTTP so local dev still stores it. Value is the raw token. `Max-Age` is the remaining seconds until `expires_at`.

The cookie only carries the token across the OAuth redirect. Validity is always re-checked against the database.

### Opening the link

`GET /invite/:token` is a server route, not a Vue page.

- Hash the token and load the invite.
- Spendable: set the cookie and redirect to `/login`.
- Not spendable: do not set the cookie. Redirect to `/invite-unavailable?reason=` with one of `missing`, `expired`, `used`, `revoked`. Do not put the raw token on that URL.

`/invite-unavailable` explains the reason and links to `/login` for people who already have an account. It never starts OAuth.

### Admin API

All write and list routes call `authorize(event, manageUsers)`.

- `POST /api/invites` body `{ role }`. Reject any role other than `viewer`, `editor`, `admin`. Create the row. Return `{ id, url, role, expiresAt }` once.
- `GET /api/invites` returns pending invites only: not used, not revoked, not expired. Fields: `id`, `role`, `expiresAt`, `createdAt`. No token, no URL.
- `DELETE /api/invites/:id` sets `revoked_at` if the invite is still pending. 404 if missing. Already used or expired invites are not listed, so revoke of those returns 404.

`GET /api/invites/current` is public. It reads the cookie, hashes it, and returns `{ role, expiresAt }` when the invite is spendable. Otherwise 404. It does not return the token.

## Login

GitHub and Google callbacks both call one shared function, `completeOAuthLogin`. Do not duplicate the invite rules in each route.

Profile input: provider (`github` or `google`), provider id, email, name, image, email verified.

### Find an existing user

1. Match `github_id` or `google_id`.
2. Else match email, when email is non-empty.

If found:

- Attach the provider id if that column is empty. Do not clear the other provider id.
- If the provider id is in `ADMIN_GITHUB_IDS` or `ADMIN_GOOGLE_IDS`, set role to `admin`. Otherwise keep the stored role. Never assign `viewer` just because they signed in.
- Update name and image from the profile.
- Do not read, clear, or spend the invite cookie.
- Set the session and redirect to `/`.

### Create a user

If no user is found:

1. If email is missing or blank, do not create a user. Redirect to `/login?error=invite_required`. The users table requires a unique email, so this also applies to an env-admin provider id. Do not invent a second error code.
2. If the provider id is in the matching admin env list and email is non-blank, create the user as `admin` without an invite. Do not spend any invite cookie. This is the owner bootstrap so the app cannot be locked out.
3. Otherwise read `cookbook-invite`, hash it, and claim a spendable invite in one database transaction:
   - `UPDATE` the invite set `used_at = now` where the hash matches and the invite is still spendable.
   - If zero rows changed, the invite is missing, expired, used, or revoked. Do not insert a user. Redirect to `/login?error=invite_required`.
   - Insert the user with the invite's role and the provider id.
   - If the insert fails, roll the transaction back so `used_at` is not left set, then fail the login.
4. Clear the invite cookie only after a new user is created from that invite.
5. Set the session and redirect to `/`.

Two people racing the same link: the conditional `UPDATE` lets one win. The loser is treated as uninvited.

Existing accounts sign in from `/login` with no invite cookie. Public recipe browsing is unchanged. `GET /auth/dev` still skips the invite check and is still gated by `import.meta.dev`.

## Sessions

Set `runtimeConfig.session.maxAge` to `60 * 60 * 24 * 7` (7 days). That is the cookie and seal lifetime from `createdAt`.

h3 does not move `createdAt` when session data is updated. A request hook owns freshness and sliding:

1. If there is no session user, do nothing.
2. Load the user row by id.
3. If the row is missing, clear the session.
4. Build the session user from the database row (`id`, `name`, `email`, `image`, `role`).
5. If that payload differs from the sealed user, or the session age is at least 1 day (`60 * 60 * 24` seconds), write it back with `setUserSession`.
6. When the age is at least 1 day, set that session's `createdAt` to now on the h3 session object before sealing, so expiry moves forward 7 days. This is the known workaround for h3 sealing expiry from the original `createdAt`.

Permission checks do not wait for that write. `resolveServerUser` returns the database user (or null), not `session.user`. A demotion or deletion applies on the next request that checks an ability.

The client calls `useUserSession().fetch()` on load and on client-side navigation while logged in, so the header role catches up. Do not reseal the cookie on every API call just to refresh the badge.

Dev personas use the same sliding hook once they have a session.

## Screens

### `/admin/users`

The existing user list stays, including locked env admins and the role select.

Above the list, an Invite card:

- Role select: Viewer, Editor, Admin.
- Create button calls `POST /api/invites`.
- On success, show the URL and a copy button until the admin navigates away. A refresh cannot get the URL back. Say that. Revoke and create another if it is lost.

Under the card, pending invites only: role, expiry, Revoke. Used, expired, and revoked invites are not shown. No email field.

### `/login`

Keep GitHub, Google, and the local dev personas.

If `GET /api/invites/current` succeeds, say they will join as that role. Otherwise say new accounts need an invite from an admin, and existing accounts can sign in as usual.

`?error=invite_required` shows one message: you need an invite from an admin. Do not add other error codes.

### `/invite-unavailable`

Explain `missing`, `expired`, `used`, or `revoked`. Link to `/login`. Do not start OAuth.

## Errors

| Case | Result |
|------|--------|
| Token missing, expired, used, or revoked | Invite page explains it. No cookie. No OAuth |
| New person, no spendable invite, not an env admin | No user row. Redirect `/login?error=invite_required` |
| New person, blank email, including an env-admin provider id | No user row. Same `/login?error=invite_required` redirect. No second error code |
| Two redemptions of one link | First insert wins. Second is uninvited |
| Existing user, invite cookie present | Sign in. Role unchanged (except env-admin promotion). Invite unused |
| User row deleted while session cookie remains | Next request clears the session |
| Invalid role on create | 400 |

## Testing

Cover these in server tests. Do not require a browser.

- New account is refused with no invite, an expired invite, a used invite, a revoked invite, or a missing token.
- New account is created with the invite's role, and that invite then has `used_at` set.
- A second redemption of the same invite does not create a second user.
- An existing user matched by provider id or email does not spend the invite and does not lose their role.
- Linking a second provider sets that provider id and does not set role to `viewer`.
- A provider id in `ADMIN_GITHUB_IDS` or `ADMIN_GOOGLE_IDS` creates an admin with no invite.
- Blank email does not create a user.
- `POST` and `DELETE` invites reject callers who fail `manageUsers`.
- `GET /api/invites` omits used, expired, and revoked rows, and never returns a token or URL.
- Session config `maxAge` is 7 days.
- A session at least 1 day old is resealed with a new `createdAt`.
- `resolveServerUser` returns the database role when it differs from the cookie.
- Dev auth still creates a session without an invite when `import.meta.dev` and dev auth are on.

## Files

- `server/db/schema.ts` — `invites` table
- generated migration under `server/db/migrations/sqlite/`
- `server/utils/invites.ts` — hash, create, list pending, revoke, lookup, claim
- `server/utils/oauthLogin.ts` — `completeOAuthLogin`
- `server/routes/auth/github.get.ts`, `server/routes/auth/google.get.ts` — call the shared login
- `server/routes/invite/[token].get.ts`
- `app/pages/invite-unavailable.vue`
- `server/api/invites/index.get.ts`, `server/api/invites/index.post.ts`, `server/api/invites/[id].delete.ts`, `server/api/invites/current.get.ts`
- `server/plugins/session-refresh.ts` — database user, slide, clear missing users
- `server/plugins/authorization-resolver.ts` — resolve from the database user
- `nuxt.config.ts` — `session.maxAge`
- `app/pages/admin/users.vue`, `app/pages/login.vue`
- client navigation hook that calls `useUserSession().fetch()`
- tests beside the existing server and ability tests
