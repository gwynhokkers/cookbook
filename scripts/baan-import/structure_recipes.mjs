#!/usr/bin/env node
/**
 * Split Docling page markdown into reviewable recipe JSON drafts.
 *
 * Usage:
 *   node scripts/baan-import/structure_recipes.mjs [--pages DIR] [--output DIR]
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  structureMarkdownSection,
  slugify,
  normalizeTitleKey,
  titleOverlap
} from './parse-recipe.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PAGES = path.join(HERE, 'out/pages')
const DEFAULT_OUT = path.join(HERE, 'out/recipes')
const DEFAULT_SOURCE = 'Baan — Kay Plunkett-Hogge'
const DEFAULT_TAGS = ['thai', 'baan']

function parseArgs(argv) {
  const args = { pages: DEFAULT_PAGES, output: DEFAULT_OUT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pages') args.pages = path.resolve(argv[++i] || DEFAULT_PAGES)
    else if (a === '--output') args.output = path.resolve(argv[++i] || DEFAULT_OUT)
  }
  return args
}

function splitByHeadings(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n')
  const matches = [...text.matchAll(/^##\s+(.+)$/gm)]
  if (matches.length === 0) {
    const trimmed = text.trim()
    return trimmed ? [{ title: '', body: trimmed }] : []
  }
  const sections = []
  for (let i = 0; i < matches.length; i++) {
    const title = matches[i][1].trim()
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const body = text.slice(start, end).trim()
    const isComponent = /^for\s+the\b/i.test(title)
    if (isComponent && sections.length > 0) {
      const prev = sections[sections.length - 1]
      prev.body = `${prev.body}\n\n## ${title}\n\n${body}`.trim()
      continue
    }
    sections.push({ title, body })
  }
  return sections
}

function isMostlyEmpty(markdown) {
  const stripped = String(markdown || '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/#+\s*/g, '')
    .trim()
  return stripped.length < 40
}

function recipeScore(recipe) {
  return (recipe.ingredients?.length || 0) * 3 + (recipe.steps?.length || 0)
}

function dedupeRecipes(recipes) {
  const kept = []
  for (const recipe of recipes) {
    const key = normalizeTitleKey(recipe.title)
    const dup = kept.find((other) => {
      if (normalizeTitleKey(other.title) === key) return true
      return titleOverlap(other.title, recipe.title) >= 0.7
    })
    if (!dup) {
      kept.push(recipe)
      continue
    }
    if (recipeScore(recipe) > recipeScore(dup)) {
      const idx = kept.indexOf(dup)
      kept[idx] = recipe
    }
  }
  return kept
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await mkdir(args.output, { recursive: true })

  const files = (await readdir(args.pages))
    .filter((n) => n.endsWith('.md'))
    .sort()

  const corpus = []
  for (const file of files) {
    const md = await readFile(path.join(args.pages, file), 'utf8')
    if (isMostlyEmpty(md)) continue
    corpus.push(`\n\n<!-- page: ${file} -->\n\n${md}`)
  }

  const sections = splitByHeadings(corpus.join('\n'))
  const drafts = []

  for (const section of sections) {
    if (!section.title) continue
    const structured = structureMarkdownSection(section.title, section.body)
    if (!structured.title) continue
    if (structured.ingredients.length === 0 && structured.steps.length === 0) continue

    drafts.push({
      title: structured.title,
      description: structured.description,
      tags: DEFAULT_TAGS,
      source: DEFAULT_SOURCE,
      visibility: 'private',
      servings: structured.servings || undefined,
      steps: structured.steps,
      ingredients: structured.ingredients.map((ing) => ({
        ingredientName: ing.ingredientName,
        amount: ing.amount || '1',
        unit: ing.unit || 'pieces',
        notes: ing.notes || null
      }))
    })
  }

  const unique = dedupeRecipes(drafts)
  const index = []

  for (let i = 0; i < unique.length; i++) {
    const recipe = unique[i]
    const filename = `${String(i + 1).padStart(3, '0')}-${slugify(recipe.title)}.json`
    await writeFile(
      path.join(args.output, filename),
      `${JSON.stringify(recipe, null, 2)}\n`,
      'utf8'
    )
    index.push({
      file: filename,
      title: recipe.title,
      ingredients: recipe.ingredients.length,
      steps: recipe.steps.length
    })
  }

  await writeFile(
    path.join(args.output, 'index.json'),
    `${JSON.stringify({ count: index.length, recipes: index }, null, 2)}\n`,
    'utf8'
  )

  console.log(`Wrote ${unique.length} recipe draft(s) to ${args.output}`)
  for (const row of index) {
    console.log(`  ${row.file}  (${row.ingredients} ingredients, ${row.steps} steps)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
