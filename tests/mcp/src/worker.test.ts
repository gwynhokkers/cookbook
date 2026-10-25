import { beforeEach, describe, expect, it } from 'vitest'
import { createWorker } from '~~/mcp/src/worker'
import { createTestDb, seedRecipe, type TestDb } from '../testDb'

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext

async function postMcp(db: TestDb, method: string, params: Record<string, unknown>) {
  const worker = createWorker(() => db)
  const response = await worker.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'host': 'localhost',
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  }), { APP_ORIGIN: 'https://cookbook.example' }, ctx)
  const body = await response.text()
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).at(-1)
    : JSON.parse(body)
  return { status: response.status, json }
}

function callGetRecipe(db: TestDb, recipeId: string) {
  return postMcp(db, 'tools/call', { name: 'get_recipe', arguments: { recipeId } })
}

describe('get_recipe MCP tool', () => {
  let db: TestDb

  beforeEach(() => {
    db = createTestDb()
  })

  it('returns a public recipe as structured content', async () => {
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

  it('answers not found for a private recipe without leaking it', async () => {
    await seedRecipe(db, { id: 'secret', title: 'Family curry', visibility: 'private' })

    const { json } = await callGetRecipe(db, 'secret')

    expect(json.result.isError).toBe(true)
    expect(json.result.content[0].text).toBe('Recipe not found: secret')
    expect(JSON.stringify(json)).not.toContain('Family curry')
  })

  it('lists get_recipe as the only tool', async () => {
    const { json } = await postMcp(db, 'tools/list', {})

    expect(json.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['get_recipe'])
  })
})
