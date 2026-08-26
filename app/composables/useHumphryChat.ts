import { DefaultChatTransport, type UIMessage } from 'ai'
import { useChat } from '@ai-sdk/vue'
import { createSharedComposable } from '@vueuse/core'

export type HumphrySessionSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

const HUMPHRY_GREETING: UIMessage = {
  id: 'humphry-greeting',
  role: 'assistant',
  parts: [{
    type: 'text',
    text: 'Hi, I\'m Humphry — ask me what to cook from the Humboldt Kitchen collection, or help build a shopping list.'
  }]
}

function useHumphryChatBase() {
  const toast = useToast()
  const sessions = ref<HumphrySessionSummary[]>([])
  const activeSessionId = ref<string | null>(null)
  const sessionsLoading = ref(false)
  const searchQuery = ref('')
  const searching = ref(false)
  const ready = ref(false)

  const chat = useChat({
    messages: [HUMPHRY_GREETING],
    transport: new DefaultChatTransport({
      api: '/api/humphry/chat',
      prepareSendMessagesRequest({ messages }) {
        if (!activeSessionId.value) {
          throw new Error('No active Humphry session')
        }
        return {
          body: {
            sessionId: activeSessionId.value,
            messages
          }
        }
      }
    }),
    onError(error) {
      toast.add({
        title: 'Humphry error',
        description: error.message || 'Something went wrong. Please try again.',
        color: 'error'
      })
    },
    async onFinish() {
      await refreshSessions()
    }
  })

  async function refreshSessions() {
    sessionsLoading.value = true
    try {
      if (searchQuery.value.trim()) {
        searching.value = true
        const result = await $fetch<{ sessions: HumphrySessionSummary[] }>(
          '/api/humphry/sessions/search',
          { query: { q: searchQuery.value.trim(), limit: 30 } }
        )
        sessions.value = result.sessions
      } else {
        const result = await $fetch<{ sessions: HumphrySessionSummary[] }>(
          '/api/humphry/sessions',
          { query: { limit: 30 } }
        )
        sessions.value = result.sessions
      }
    } finally {
      sessionsLoading.value = false
      searching.value = false
    }
  }

  async function createSession() {
    const result = await $fetch<{ session: HumphrySessionSummary }>(
      '/api/humphry/sessions',
      { method: 'POST' }
    )
    sessions.value = [result.session, ...sessions.value.filter(s => s.id !== result.session.id)]
    activeSessionId.value = result.session.id
    chat.messages.value = [HUMPHRY_GREETING]
    return result.session
  }

  async function selectSession(sessionId: string) {
    const detail = await $fetch<{
      id: string
      title: string
      messages: UIMessage[]
    }>(`/api/humphry/sessions/${sessionId}`)

    activeSessionId.value = detail.id
    chat.messages.value = detail.messages.length
      ? detail.messages
      : [HUMPHRY_GREETING]
  }

  async function deleteSession(sessionId: string) {
    await $fetch(`/api/humphry/sessions/${sessionId}`, { method: 'DELETE' })
    sessions.value = sessions.value.filter(s => s.id !== sessionId)

    if (activeSessionId.value === sessionId) {
      if (sessions.value[0]) {
        await selectSession(sessions.value[0].id)
      } else {
        await createSession()
      }
    }
  }

  async function ensureReady() {
    if (ready.value) {
      return
    }
    await refreshSessions()
    if (sessions.value[0]) {
      await selectSession(sessions.value[0].id)
    } else {
      await createSession()
    }
    ready.value = true
  }

  watch(searchQuery, async () => {
    if (!ready.value) {
      return
    }
    await refreshSessions()
  })

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    sendMessage: chat.sendMessage,
    regenerate: chat.regenerate,
    stop: chat.stop,
    sessions,
    activeSessionId,
    sessionsLoading,
    searchQuery,
    searching,
    ready,
    refreshSessions,
    createSession,
    selectSession,
    deleteSession,
    ensureReady
  }
}

export const useHumphryChat = createSharedComposable(useHumphryChatBase)
