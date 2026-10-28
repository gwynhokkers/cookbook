import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '~~/server/db/schema'
import { createWorker } from '~~/mcp/src/worker'
import { createTestDb, seedRecipe, seedUser, type TestDb } from '../testDb'

function ctxFor(props: Record<string, unknown>) {
  return { waitUntil() {}, passThroughOnException() {}, props } as unknown as ExecutionContext
}

async function postMcp(db: TestDb, props: Record<string, unknown>, method: string, params: Record<string, unknown>) {
  const worker = createWorker(() => db)
  const response = await worker.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'host': 'localhost',
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }), { APP_ORIGIN: 'https://cookbook.example' }, ctxFor(props))
  const body = await response.text()
  if (!response.ok) return { status: response.status, json: null }
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).at(-1)
    : JSON.parse(body)
  return { status: response.status, json }
}

const seedReader = (db: TestDb) => seedUser(db, { id: 'u1', email: 'cook@example.com', githubId: '4242' })
const ids = (result: { structuredContent: { recipes: Array<{ id: string }> } }) => result.structuredContent.recipes.map(recipe => recipe.id)

const readerProps = { userId: 'u1', scopes: ['recipes:read'] }

function callTool(db: TestDb, name: string, args: Record<string, unknown>, props: Record<string, unknown> = readerProps) {
  return postMcp(db, props, 'tools/call', { name, arguments: args })
}

function callGetRecipe(db: TestDb, recipeId: string, props: Record<string, unknown> = readerProps) {
  return callTool(db, 'get_recipe', { recipeId }, props)
}

describe('get_recipe MCP tool', () => {
  let db: TestDb

  beforeEach(async () => {
    db = createTestDb()
    await seedReader(db)
  })

  it('returns a recipe as structured content', async () => {
    await seedRecipe(db, {
      id: 'dal',
      title: 'Tarka dal',
      visibility: 'public',
      steps: [{ title: 'Simmer', content: 'Simmer the lentils.' }],
      ingredients: [{ name: 'red lentils', amount: '250', unit: 'g', order: '0' }]
    })

    const { status, json } = await callGetRecipe(db, 'dal')

    expect(status).toBe(200)
    expect(json.result.isError).toBeFalsy()
    expect(json.result.structuredContent).toMatchObject({
      id: 'dal',
      title: 'Tarka dal',
      ingredients: [{ name: 'red lentils', amount: '250', unit: 'g', notes: null }],
      steps: [{ title: 'Simmer', content: 'Simmer the lentils.' }]
    })
  })

  it('turns a stored image path into an absolute URL on the app origin', async () => {
    await seedRecipe(db, { id: 'dal', title: 'Tarka dal', visibility: 'public', imageUrl: '/api/images/dal.jpg' })

    const { json } = await callGetRecipe(db, 'dal')

    expect(json.result.structuredContent.imageUrl).toBe('https://cookbook.example/api/images/dal.jpg')
  })

  it('returns a private recipe to the signed-in user', async () => {
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })

    const { json } = await callGetRecipe(db, 'secret')

    expect(json.result.isError).toBeFalsy()
    expect(json.result.structuredContent).toMatchObject({ id: 'secret', title: 'Family curry' })
  })

  it('answers not found for an unknown id', async () => {
    const { json } = await callGetRecipe(db, 'nope')

    expect(json.result.isError).toBe(true)
    expect(json.result.content[0].text).toBe('Recipe not found: nope')
  })

  it('rejects the next call once the user is removed from D1', async () => {
    await seedRecipe(db, { id: 'dal', title: 'Tarka dal', visibility: 'public' })
    expect((await callGetRecipe(db, 'dal')).status).toBe(200)

    await db.delete(schema.users).where(eq(schema.users.id, 'u1'))

    expect((await callGetRecipe(db, 'dal')).status).toBe(401)
  })

  it('rejects a request with no signed-in user', async () => {
    expect((await callGetRecipe(db, 'dal', {})).status).toBe(401)
  })
})

describe('cookbook MCP tools', () => {
  it('lists the recipe tools', async () => {
    const db = createTestDb()
    await seedReader(db)

    const { json } = await postMcp(db, readerProps, 'tools/list', {})

    expect(json.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(['get_recipe', 'list_recipes', 'list_sources', 'list_tags', 'search_recipes'])
  })

  it.each([
    ['get_recipe', { recipeId: 'dal' }],
    ['search_recipes', { query: 'dal' }],
    ['list_recipes', {}],
    ['list_tags', {}],
    ['list_sources', {}]
  ])('%s refuses a connection without recipes:read', async (name, args) => {
    const db = createTestDb()
    await seedReader(db)
    await seedRecipe(db, { id: 'dal', title: 'Tarka dal', visibility: 'public' })

    const { json } = await callTool(db, name, args, { userId: 'u1', scopes: [] })

    expect(json.result.isError).toBe(true)
    expect(json.result.content[0].text).toContain('recipes:read')
  })
})

describe('search_recipes MCP tool', () => {
  let db: TestDb

  beforeEach(async () => {
    db = createTestDb()
    await seedReader(db)
  })

  it('finds private recipes by ingredient, with image URLs on the app origin', async () => {
    await seedRecipe(db, {
      id: 'dal',
      title: 'Tarka dal',
      visibility: 'private',
      imageUrl: '/api/images/dal.jpg',
      ingredients: [{ name: 'red lentils', amount: '250', unit: 'g', order: '0' }]
    })
    await seedRecipe(db, { id: 'toast', title: 'Cheese on toast', visibility: 'public' })

    const { json } = await callTool(db, 'search_recipes', { query: 'lentils' })

    expect(json.result.isError).toBeFalsy()
    expect(json.result.structuredContent).toMatchObject({ page: 1, total: 1, totalPages: 1 })
    expect(json.result.structuredContent.recipes).toEqual([expect.objectContaining({
      id: 'dal',
      title: 'Tarka dal',
      imageUrl: 'https://cookbook.example/api/images/dal.jpg',
      matchedOn: ['ingredient']
    })])
  })

  it('narrows results with the web search filters, cleaning values up as the web does', async () => {
    await seedRecipe(db, { id: 'dal', title: 'Tarka dal', visibility: 'public', tags: ['dinner', 'vegan'], source: 'Dishoom' })
    await seedRecipe(db, { id: 'dal-soup', title: 'Dal soup', visibility: 'public', tags: ['lunch'], source: 'Dishoom' })
    await seedRecipe(db, { id: 'dal-makhani', title: 'Dal makhani', visibility: 'public', tags: ['dinner'], source: 'Ottolenghi' })

    const byTag = await callTool(db, 'search_recipes', { query: 'dal', tags: ['dinner '], sources: [' Dishoom', ''] })
    const byDiet = await callTool(db, 'search_recipes', { query: 'dal', diet: ['Vegan'] })

    expect(ids(byTag.json.result)).toEqual(['dal'])
    expect(ids(byDiet.json.result)).toEqual(['dal'])
  })

  it('ranks the user\'s favourites higher, as the web search does', async () => {
    await seedRecipe(db, { id: 'tarka', title: 'Tarka dal', visibility: 'public' })
    await seedRecipe(db, {
      id: 'soup',
      title: 'Lentil soup',
      visibility: 'public',
      ingredients: [{ name: 'toor dal', amount: '200', unit: 'g', order: '0' }]
    })
    const before = await callTool(db, 'search_recipes', { query: 'dal' })

    await db.insert(schema.recipeFavorites).values({ userId: 'u1', recipeId: 'soup' })
    const after = await callTool(db, 'search_recipes', { query: 'dal' })

    expect(ids(before.json.result)).toEqual(['tarka', 'soup'])
    expect(ids(after.json.result)).toEqual(['soup', 'tarka'])
  })
})

describe('list_recipes MCP tool', () => {
  let db: TestDb

  beforeEach(async () => {
    db = createTestDb()
    await seedReader(db)
  })

  it('pages through recipes newest first, 12 at a time', async () => {
    for (let day = 1; day <= 13; day++) {
      const dd = String(day).padStart(2, '0')
      await seedRecipe(db, { id: `r${dd}`, title: `Recipe ${dd}`, visibility: 'public', date: `2026-01-${dd}` })
    }

    const first = await callTool(db, 'list_recipes', {})
    const second = await callTool(db, 'list_recipes', { page: 2 })

    expect(first.json.result.structuredContent).toMatchObject({ page: 1, pageSize: 12, total: 13, totalPages: 2 })
    expect(first.json.result.structuredContent.recipes[0].id).toBe('r13')
    expect(first.json.result.structuredContent.recipes).toHaveLength(12)
    expect(ids(second.json.result)).toEqual(['r01'])
  })

  it('filters by tag and source, including private recipes for the signed-in user', async () => {
    await seedRecipe(db, { id: 'curry', title: 'Family curry', visibility: 'private', tags: ['dinner'], source: 'Nan' })
    await seedRecipe(db, { id: 'soup', title: 'Lentil soup', visibility: 'public', tags: ['lunch'], source: 'Nan' })
    await seedRecipe(db, { id: 'stew', title: 'Bean stew', visibility: 'public', tags: ['dinner'], source: 'Ottolenghi' })

    const { json } = await callTool(db, 'list_recipes', { tags: ['dinner'], sources: ['Nan'] })

    expect(ids(json.result)).toEqual(['curry'])
  })
})

describe('list_tags and list_sources MCP tools', () => {
  let db: TestDb

  beforeEach(async () => {
    db = createTestDb()
    await seedReader(db)
    await seedRecipe(db, { id: 'curry', title: 'Family curry', visibility: 'private', tags: ['Dinner', 'vegan', 'spicy'], source: 'Nan' })
    await seedRecipe(db, { id: 'soup', title: 'Lentil soup', visibility: 'public', tags: ['lunch', 'Dinner'], source: 'Dishoom' })
  })

  it('lists tags in alphabetical order without diet tags, narrowed by q', async () => {
    const all = await callTool(db, 'list_tags', {})
    const narrowed = await callTool(db, 'list_tags', { q: 'din' })

    expect(all.json.result.structuredContent).toEqual({ tags: ['Dinner', 'lunch', 'spicy'] })
    expect(narrowed.json.result.structuredContent).toEqual({ tags: ['Dinner'] })
  })

  it('lists sources in alphabetical order, narrowed by q', async () => {
    const all = await callTool(db, 'list_sources', {})
    const narrowed = await callTool(db, 'list_sources', { q: 'dish' })

    expect(all.json.result.structuredContent).toEqual({ sources: ['Dishoom', 'Nan'] })
    expect(narrowed.json.result.structuredContent).toEqual({ sources: ['Dishoom'] })
  })
})
