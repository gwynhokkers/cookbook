#!/usr/bin/env node
/**
 * Pull from remote D1 and load into local SQLite in one step.
 *
 * Usage:
 *   node scripts/recipe-sync/sync.mjs --visibility all --limit 20
 *   node scripts/recipe-sync/sync.mjs --source "Book Title — Author" --visibility all
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function run(script, argv) {
  const result = spawnSync(process.execPath, [path.join(HERE, script), ...argv], {
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function flagValue(argv, name) {
  const idx = argv.indexOf(name)
  return idx >= 0 ? String(argv[idx + 1] || '').trim() : ''
}

function slugify(input) {
  return String(input || 'recipes')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'recipes'
}

const argv = process.argv.slice(2)
run('pull.mjs', argv)

const outDirFlag = flagValue(argv, '--out-dir')
let outDir = outDirFlag
if (!outDir) {
  let slug = flagValue(argv, '--slug')
  if (!slug) {
    const source = flagValue(argv, '--source')
    const tag = flagValue(argv, '--tag')
    const offset = Number(flagValue(argv, '--offset') || 0)
    slug = slugify(source || tag || 'recipes')
    if (offset > 0) slug = `${slug}-offset-${offset}`
  }
  outDir = path.join(HERE, 'out', slug)
}

run('load.mjs', ['--dir', outDir])
