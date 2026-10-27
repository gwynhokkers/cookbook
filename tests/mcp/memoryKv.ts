type Entry = { value: string, metadata?: unknown }

export function createMemoryKv() {
  const store = new Map<string, Entry>()
  return {
    async get(key: string, options?: 'text' | 'json' | { type?: 'text' | 'json' }) {
      const entry = store.get(key)
      if (!entry) return null
      const type = typeof options === 'string' ? options : options?.type
      return type === 'json' ? JSON.parse(entry.value) : entry.value
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      store.set(key, { value, metadata: options?.metadata })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(options: { prefix?: string } = {}) {
      const keys = [...store.entries()]
        .filter(([name]) => name.startsWith(options.prefix ?? ''))
        .map(([name, entry]) => ({ name, metadata: entry.metadata }))
      return { keys, list_complete: true, cursor: '' }
    }
  } as unknown as KVNamespace
}
