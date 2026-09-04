#!/usr/bin/env node
/**
 * Batch-convert cookbook page scans with local Docling OCR.
 *
 * Usage:
 *   node scripts/recipe-import/ocr.mjs --source "/path/to/scans" [--book slug] [--output DIR] [--offset N] [--limit N]
 *
 * If --book is set and --output is not, writes to scripts/recipe-import/out/<book>/pages
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile, access, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])
const HERE = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = { source: '', book: '', output: '', offset: 0, limit: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = argv[++i] || ''
    else if (a === '--book') args.book = String(argv[++i] || '').trim()
    else if (a === '--output') args.output = path.resolve(argv[++i] || '')
    else if (a === '--offset') args.offset = Number(argv[++i] || 0)
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
    else if (!a.startsWith('--') && !args.source) args.source = a
  }
  if (!args.output) {
    args.output = args.book
      ? path.join(HERE, 'out', args.book, 'pages')
      : path.join(HERE, 'out', 'pages')
  }
  return args
}

/** Natural sort so Ayla_1_p2 comes before Ayla_1_p10. */
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

async function listImages(dir) {
  const names = await readdir(dir)
  const images = names.filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
  const imgSeq = images.filter((n) => /^IMG/i.test(n)).sort(naturalCompare)
  const named = images.filter((n) => !/^IMG/i.test(n)).sort(naturalCompare)
  // Sequential camera scans first (book order), named dish shots last.
  return [...imgSeq, ...named]
}

function runDocling(sourcePath, outputDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docling',
      [
        'convert',
        '--from', 'image',
        '--to', 'md',
        '--ocr',
        '--ocr-engine', 'ocrmac',
        '--image-export-mode', 'placeholder',
        '--output', outputDir,
        sourcePath
      ],
      { stdio: 'inherit' }
    )
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`docling convert exited with code ${code}`))
    })
  })
}

async function writeManifest(sourceDir, outputDir, imageNames) {
  const lines = []
  for (let i = 0; i < imageNames.length; i++) {
    const filename = imageNames[i]
    const stem = filename.replace(/\.[^.]+$/, '')
    const mdPath = path.join(outputDir, `${stem}.md`)
    let hasMd = false
    try {
      await access(mdPath)
      hasMd = true
    } catch {
      hasMd = false
    }
    lines.push(JSON.stringify({
      pageIndex: i,
      filename,
      sourcePath: path.join(sourceDir, filename),
      mdPath: hasMd ? mdPath : null
    }))
  }
  await writeFile(path.join(outputDir, 'pages.jsonl'), `${lines.join('\n')}\n`, 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.source) {
    console.error('Usage: node scripts/recipe-import/ocr.mjs --source "/path/to/scans" [--book slug] [--output DIR] [--offset N] [--limit N]')
    process.exit(1)
  }

  const sourceDir = path.resolve(args.source)
  const outputDir = args.output
  await mkdir(outputDir, { recursive: true })

  const allImages = await listImages(sourceDir)
  let images = allImages
  if (args.offset > 0) images = images.slice(args.offset)
  if (args.limit > 0) images = images.slice(0, args.limit)
  if (images.length === 0) {
    console.error(`No images found in ${sourceDir}${args.offset ? ` (offset ${args.offset})` : ''}`)
    process.exit(1)
  }

  console.log(`Converting ${images.length} image(s) from ${sourceDir}${args.offset ? ` (offset ${args.offset})` : ''}`)
  console.log('Docling flags: --from image --to md --ocr --ocr-engine ocrmac --image-export-mode placeholder')

  let convertSource = sourceDir
  let tmpDir = ''
  if (images.length < allImages.length) {
    tmpDir = path.join(tmpdir(), `recipe-ocr-${Date.now()}`)
    await mkdir(tmpDir, { recursive: true })
    for (const name of images) {
      await symlink(path.join(sourceDir, name), path.join(tmpDir, name))
    }
    convertSource = tmpDir
  }

  try {
    await runDocling(convertSource, outputDir)
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
  }

  await writeManifest(sourceDir, outputDir, images)
  console.log(`Wrote ${path.join(outputDir, 'pages.jsonl')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
