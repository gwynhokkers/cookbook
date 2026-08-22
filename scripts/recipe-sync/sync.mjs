#!/usr/bin/env node
/**
 * Pull from remote D1 and load into local SQLite in one step.
 *
 * Usage:
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

const argv = process.argv.slice(2)
run('pull.mjs', argv)

const slugArgIndex = argv.indexOf('--slug')
const sourceArgIndex = argv.indexOf('--source')
const tagArgIndex = argv.indexOf('--tag')
const outDirArgIndex = argv.indexOf('--out-dir')

let outDir = ''
if (outDirArgIndex >= 0) {
  outDir = argv[outDirArgIndex + 1]
} else {
  let slug = slugArgIndex >= 0 ? argv[slugArgIndex + 1] : ''
  if (!slug) {
    const source = sourceArgIndex >= 0 ? argv[sourceArgIndex + 1] : ''
    const tag = tagArgIndex >= 0 ? argv[tagArgIndex + 1] : ''
    slug = String(source || tag || 'recipes')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'recipes'
  }
  outDir = path.join(HERE, 'out', slug)
}

run('load.mjs', ['--dir', outDir])
