#!/usr/bin/env node
/**
 * POST reviewed recipe JSON drafts to /api/recipes/import.
 *
 * Requires a fresh review-pass.json from audit-recipes.mjs (unless --force).
 * Uploads one recipe at a time with a delay to avoid Worker CPU limits.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/recipe-import/audit-recipes.mjs --book curry --run 5
 *   node scripts/recipe-import/upload.mjs --book curry --run 5 [--base-url URL] [--dry-run] [--limit N]
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditPassed, auditRecipe } from './lib/auditRecipe.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_BASE = 'https://cookbook.megwyn.co.uk'
const REVIEW_PASS = 'review-pass.json'
const DEFAULT_DELAY_MS = 8000
const SKIP_FILES = new Set(['index.json', 'upload-results.json', 'carry-forwards.json', REVIEW_PASS])

function parseArgs(argv) {
  const args = {
    book: '',
    dir: '',
    run: '',
    baseUrl: DEFAULT_BASE,
    dryRun: false,
    limit: 0,
    delayMs: DEFAULT_DELAY_MS,
    force: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--book') args.book = String(argv[++i] || '').trim()
    else if (a === '--dir') args.dir = path.resolve(argv[++i] || '')
    else if (a === '--run') args.run = String(argv[++i] || '').trim()
    else if (a === '--base-url') args.baseUrl = String(argv[++i] || DEFAULT_BASE).replace(/\/$/, '')
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || DEFAULT_DELAY_MS))
    else if (a === '--force') args.force = true
  }
  if (!args.dir) {
    if (args.book && args.run) {
      args.dir = path.join(HERE, 'out', args.book, `recipes-run${args.run}`)
    } else if (args.book) {
      args.dir = path.join(HERE, 'out', args.book, 'recipes')
    } else {
      args.dir = path.join(HERE, 'out', 'recipes')
    }
  }
  return args
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function verifyReviewPass(dir, files, force) {
  const stampPath = path.join(dir, REVIEW_PASS)
  let stamp
  try {
    stamp = JSON.parse(await readFile(stampPath, 'utf8'))
  } catch {
    if (force) {
      console.warn('WARN: --force bypasses missing review-pass.json (agents must not use --force)')
      return
    }
    console.error(`Missing ${stampPath}`)
    console.error('Run audit first: node scripts/recipe-import/audit-recipes.mjs --dir', dir)
    process.exit(1)
  }

  if (stamp.dir && path.resolve(stamp.dir) !== path.resolve(dir)) {
    console.error(`review-pass.json dir mismatch: ${stamp.dir} vs ${dir}`)
    process.exit(1)
  }

  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8')
    const hash = sha256(raw)
    if (stamp.files?.[file] !== hash) {
      console.error(`${file} changed since audit — re-run audit-recipes.mjs before upload`)
      process.exit(1)
    }
    if (!stamp.files?.[file]) {
      console.error(`${file} was not in the audited batch — re-run audit-recipes.mjs on the full directory`)
      process.exit(1)
    }
  }
}

async function runInlineAudit(dir, files) {
  const allIssues = []
  for (const file of files) {
    const recipe = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    allIssues.push(...auditRecipe(recipe, file))
  }
  if (!auditPassed(allIssues)) {
    console.error(`Inline audit failed (${allIssues.length} issue(s)) — fix JSON and re-run audit`)
    for (const issue of allIssues.slice(0, 20)) {
      console.error(`  [${issue.code}] ${issue.message}`)
    }
    if (allIssues.length > 20) console.error(`  … and ${allIssues.length - 20} more`)
    process.exit(1)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const secret = process.env.MIGRATION_SECRET
  if (!args.dryRun && !secret) {
    console.error('MIGRATION_SECRET is required unless --dry-run')
    process.exit(1)
  }

  let files = (await readdir(args.dir))
    .filter((n) => n.endsWith('.json') && !SKIP_FILES.has(n))
    .sort()
  if (args.limit > 0) files = files.slice(0, args.limit)

  if (files.length === 0) {
    console.error(`No recipe JSON files in ${args.dir}`)
    process.exit(1)
  }

  await verifyReviewPass(args.dir, files, args.force)
  await runInlineAudit(args.dir, files)

  const url = `${args.baseUrl}/api/recipes/import`
  const results = []

  console.log(
    `${args.dryRun ? 'Dry-run' : 'Uploading'} ${files.length} recipe(s) to ${url} (${args.delayMs}ms between requests)`
  )

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const filePath = path.join(args.dir, file)
    const body = JSON.parse(await readFile(filePath, 'utf8'))
    const title = body.title || file

    if (args.dryRun) {
      results.push({ file, title, status: 'dry-run' })
      console.log(`  would POST ${file} (${title})`)
      continue
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }

      if (!response.ok) {
        results.push({ file, title, status: 'error', statusCode: response.status, data })
        console.error(`  FAIL ${file}: ${response.status} ${data.statusMessage || data.message || text}`)
        if (response.status === 503 || response.status === 502 || String(text).includes('1102')) {
          console.error('Stopping upload — Worker CPU limit hit. Wait, then resume with --limit on remaining files.')
          break
        }
        continue
      }

      const status = data.skipped ? 'skipped' : 'created'
      results.push({ file, title, status, id: data.id })
      console.log(`  ${status} ${file} -> ${data.id || ''}`)
    } catch (err) {
      results.push({ file, title, status: 'error', error: String(err?.message || err) })
      console.error(`  FAIL ${file}: ${err?.message || err}`)
    }

    if (!args.dryRun && i < files.length - 1 && args.delayMs > 0) {
      await sleep(args.delayMs)
    }
  }

  const logPath = path.join(args.dir, 'upload-results.json')
  await writeFile(logPath, `${JSON.stringify({ url, results }, null, 2)}\n`, 'utf8')
  const created = results.filter((r) => r.status === 'created').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'error').length
  console.log(`Done. created=${created} skipped=${skipped} failed=${failed} log=${logPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
