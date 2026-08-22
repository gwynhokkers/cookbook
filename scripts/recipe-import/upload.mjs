#!/usr/bin/env node
/**
 * POST reviewed recipe JSON drafts to /api/recipes/import.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/recipe-import/upload.mjs [--book slug] [--dir DIR] [--base-url URL] [--dry-run] [--limit N]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_BASE = 'https://cookbook.megwyn.co.uk'

function parseArgs(argv) {
  const args = {
    book: '',
    dir: '',
    baseUrl: DEFAULT_BASE,
    dryRun: false,
    limit: 0
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--book') args.book = String(argv[++i] || '').trim()
    else if (a === '--dir') args.dir = path.resolve(argv[++i] || '')
    else if (a === '--base-url') args.baseUrl = String(argv[++i] || DEFAULT_BASE).replace(/\/$/, '')
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
  }
  if (!args.dir) {
    args.dir = args.book
      ? path.join(HERE, 'out', args.book, 'recipes')
      : path.join(HERE, 'out', 'recipes')
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const secret = process.env.MIGRATION_SECRET
  if (!args.dryRun && !secret) {
    console.error('MIGRATION_SECRET is required unless --dry-run')
    process.exit(1)
  }

  let files = (await readdir(args.dir))
    .filter((n) => n.endsWith('.json') && n !== 'index.json' && n !== 'upload-results.json')
    .sort()
  if (args.limit > 0) files = files.slice(0, args.limit)

  const url = `${args.baseUrl}/api/recipes/import`
  const results = []

  console.log(`${args.dryRun ? 'Dry-run' : 'Uploading'} ${files.length} recipe(s) to ${url}`)

  for (const file of files) {
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
        continue
      }

      const status = data.skipped ? 'skipped' : 'created'
      results.push({ file, title, status, id: data.id })
      console.log(`  ${status} ${file} -> ${data.id || ''}`)
    } catch (err) {
      results.push({ file, title, status: 'error', error: String(err?.message || err) })
      console.error(`  FAIL ${file}: ${err?.message || err}`)
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
