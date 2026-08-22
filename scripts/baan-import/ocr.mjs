#!/usr/bin/env node
/**
 * Batch-convert cookbook page scans with local Docling OCR.
 *
 * Usage:
 *   node scripts/baan-import/ocr.mjs --source "/path/to/scans" [--output scripts/baan-import/out/pages] [--limit N]
 */
import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile, access, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])
const DEFAULT_OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'out/pages'
)

function parseArgs(argv) {
  const args = { source: '', output: DEFAULT_OUTPUT, limit: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--source') args.source = argv[++i] || ''
    else if (a === '--output') args.output = path.resolve(argv[++i] || DEFAULT_OUTPUT)
    else if (a === '--limit') args.limit = Number(argv[++i] || 0)
    else if (!a.startsWith('--') && !args.source) args.source = a
  }
  return args
}

async function listImages(dir) {
  const names = await readdir(dir)
  const images = names.filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
  const imgSeq = images.filter((n) => /^IMG/i.test(n)).sort()
  const named = images.filter((n) => !/^IMG/i.test(n)).sort()
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
    console.error('Usage: node scripts/baan-import/ocr.mjs --source "/path/to/scans" [--output DIR] [--limit N]')
    process.exit(1)
  }

  const sourceDir = path.resolve(args.source)
  const outputDir = args.output
  await mkdir(outputDir, { recursive: true })

  let images = await listImages(sourceDir)
  if (args.limit > 0) images = images.slice(0, args.limit)
  if (images.length === 0) {
    console.error(`No images found in ${sourceDir}`)
    process.exit(1)
  }

  console.log(`Converting ${images.length} image(s) from ${sourceDir}`)
  console.log('Docling flags: --from image --to md --ocr --ocr-engine ocrmac --image-export-mode placeholder')

  let convertSource = sourceDir
  let tmpDir = ''
  if (args.limit > 0 && images.length < (await listImages(sourceDir)).length) {
    tmpDir = path.join(tmpdir(), `baan-ocr-${Date.now()}`)
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
