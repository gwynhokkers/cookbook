#!/usr/bin/env node
/**
 * Audit reviewed recipe JSON before upload. Writes review-pass.json when clean.
 *
 * Usage:
 *   node scripts/recipe-import/audit-recipes.mjs [--book slug] [--dir DIR] [--run N]
 *
 * Exit 0 + writes review-pass.json when all recipes pass heuristics.
 * Exit 1 and prints issues when any recipe fails.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditPassed, auditRecipe } from './lib/auditRecipe.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REVIEW_PASS = 'review-pass.json'
const SKIP_FILES = new Set(['index.json', 'upload-results.json', 'carry-forwards.json', REVIEW_PASS])

function parseArgs(argv) {
  const args = { book: '', dir: '', run: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--book') args.book = String(argv[++i] || '').trim()
    else if (a === '--dir') args.dir = path.resolve(argv[++i] || '')
    else if (a === '--run') args.run = String(argv[++i] || '').trim()
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = (await readdir(args.dir))
    .filter((n) => n.endsWith('.json') && !SKIP_FILES.has(n))
    .sort()

  if (files.length === 0) {
    console.error(`No recipe JSON files in ${args.dir}`)
    process.exit(1)
  }

  /** @type {import('./lib/auditRecipe.mjs').AuditIssue[]} */
  const allIssues = []
  /** @type {Record<string, string>} */
  const hashes = {}

  for (const file of files) {
    const raw = await readFile(path.join(args.dir, file), 'utf8')
    hashes[file] = sha256(raw)
    const recipe = JSON.parse(raw)
    allIssues.push(...auditRecipe(recipe, file))
  }

  if (!auditPassed(allIssues)) {
    console.error(`Audit FAILED: ${allIssues.length} issue(s) in ${args.dir}\n`)
    for (const issue of allIssues) {
      console.error(`  [${issue.code}] ${issue.message}`)
      if (issue.detail) console.error(`           ${issue.detail}`)
    }
    console.error('\nFix JSON against OCR markdown, then re-run audit before upload.')
    process.exit(1)
  }

  const stamp = {
    version: 1,
    auditedAt: new Date().toISOString(),
    dir: args.dir,
    recipeCount: files.length,
    files: hashes
  }
  const stampPath = path.join(args.dir, REVIEW_PASS)
  await writeFile(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8')

  console.log(`Audit PASSED: ${files.length} recipe(s) in ${args.dir}`)
  console.log(`Wrote ${stampPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
