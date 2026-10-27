# Git conventions: Conventional Commits

Every commit message and branch name follows
[Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/).
Check each one against this page before you run `git commit` or `git checkout -b`.

## Types

Use one type from this list for both commits and branches.

| Type       | Use for                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `feat`     | A new user-facing or editor-facing capability                             |
| `fix`      | A bug fix                                                                 |
| `perf`     | A change that improves performance without changing behaviour             |
| `refactor` | Restructured code with no behaviour change                                |
| `style`    | Formatting or whitespace only (not CSS work; that is `feat` or `fix`)     |
| `test`     | Adding or changing tests and fixtures only                                |
| `docs`     | Documentation only, including `AGENTS.md` and `docs/`                     |
| `build`    | Dependencies, `package.json`, `bun.lock`, `nuxt.config.ts` build settings |
| `ci`       | CI and deploy pipeline config (Netlify, GitHub Actions)                   |
| `chore`    | Maintenance that fits nowhere above                                       |
| `revert`   | Reverting an earlier commit                                               |

## Commit messages

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **Scope** is optional, lowercase, and names the area touched: `storyblok`,
  `editor`, `seo`, `modal`, `cookies`, `admin`, `cloudflare`, `fonts`, `deps`.
  Omit it when the change spans several areas.
- **Subject** is imperative mood, lowercase first letter, no trailing full stop,
  72 characters or fewer for the whole header line. Write "add", "fix",
  "remove", as if completing "This commit will …".
- **Body** is optional. Explain _why_ the change was made and what it affects,
  wrapped at 72 characters, separated from the header by a blank line.
- **Footer** links the Linear issue when one exists:
  - `Refs: INK-123` for related work.
  - `Fixes: INK-123` when the commit completes the issue.
- **Breaking changes** add `!` after the type or scope and a
  `BREAKING CHANGE: <description>` footer. In this repo that includes changes
  to the build snapshot format, Storyblok component schemas, or environment
  variables a deploy depends on.

Keep each commit to one logical change. When a working tree holds unrelated
changes, stage and commit them separately, each with its own type.

### Examples

```
feat(storyblok): add snapshot support for event listings

Refs: INK-42
```

```
fix(editor): keep _editable metadata on nested card items

Visual Editor clicks on nested cards selected the parent block because
the child lost its own storyblok identity during normalisation.

Fixes: INK-57
```

```
build(deps): add bun.lock alongside package-lock.json
```

```
feat(storyblok)!: rename snapshot output directory

BREAKING CHANGE: build snapshot now writes to .data/storyblok; update
any deploy scripts that read the old path.
```

## Branch names

```
<type>/<issue>-<short-description>
<type>/<short-description>
```

- Use the same type list as commits.
- Include the Linear identifier in lowercase when the work has an issue
  (`ink-123`). Linear links the branch to the issue automatically.
- Write the description in lowercase kebab-case, three to five words,
  using only `a-z`, `0-9` and `-`.
- Branch from the up-to-date release branch for the current cycle
  (for example `release/cycle-1`), not from `main`, and keep one issue per
  branch. See [Release branches](#release-branches-per-cycle).

### Examples

```
feat/ink-42-event-listing-snapshot
fix/ink-57-nested-card-selection
docs/git-conventions
build/add-bun-lockfile
```

`main`, `release/cycle-<n>` branches and long-lived environment branches (for
example `storyblok`) are exempt from the naming pattern.

## Release branches per cycle

During the initial build, work is grouped into one-week Linear cycles (starting
Mondays), and each cycle has its own release branch. Never commit or merge
issue work straight into `main`.

| Branch                   | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `main`                   | Signed-off, released cycles only. No direct pushes.                      |
| `release/cycle-<n>`      | Integration branch for cycle `n`, cut from `main` when the cycle starts. |
| `<type>/ink-<id>-<desc>` | One Linear issue, branched from the current `release/cycle-<n>`.         |

Flow:

1. **Cycle start:** create `release/cycle-<n>` from an up-to-date `main` and
   push it.
2. **Per issue:** branch from `release/cycle-<n>`, do the work, open a pull
   request **into `release/cycle-<n>`** (not `main`), merge, and push.
3. **Unfinished issues** at cycle end: keep the issue branch and retarget its
   pull request to the next cycle's release branch, matching where the issue
   moves in Linear.
4. **Cycle end:** open one pull request from `release/cycle-<n>` into `main`
   titled `chore(release): cycle <n>`, merge with a merge commit (not squash),
   then tag `main` as `v0.<n>.0-cycle-<n>`. Cut the next release branch from
   the updated `main`.
5. **Fixes to a merged cycle:** branch `fix/ink-<id>-...` from the current
   release branch; the fix ships with that cycle.

Release branches get Netlify branch deploys for preview, so each cycle can be
reviewed before it reaches `main`.

## Pull requests

Target the current `release/cycle-<n>` branch for issue work, and `main` only
for the end-of-cycle release merge. Title the pull request with a valid
Conventional Commit header, since it
becomes the commit message on squash merge. Put `Fixes: INK-123` or
`Refs: INK-123` in the description.
