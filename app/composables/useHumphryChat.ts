import { DefaultChatTransport, type UIMessage } from 'ai'
import { useChat } from '@ai-sdk/vue'
import { createSharedComposable } from '@vueuse/core'

const STORAGE_KEY = 'humphry-chat-messages'

const HUMPHRY_GREETING: UIMessage = {
  id: 'humphry-greeting',
  role: 'assistant',
  parts: [{
    type: 'text',
    text: 'Hi, I\'m Humphry — ask me what to cook from the Humboldt Kitchen collection.'
  }]
}

function loadStoredMessages(): UIMessage[] {
  if (!import.meta.client) {
    return [HUMPHRY_GREETING]
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return [HUMPHRY_GREETING]
    }
    const parsed = JSON.parse(raw) as UIMessage[]
    return parsed.length ? parsed : [HUMPHRY_GREETING]
  } catch {
    return [HUMPHRY_GREETING]
  }
}

function persistMessages(messages: UIMessage[]) {
  if (!import.meta.client) {
    return
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  } catch {
    /* ignore quota errors */
  }
}

function useHumphryChatBase() {
  const toast = useToast()

  const chat = useChat({
    messages: loadStoredMessages(),
    transport: new DefaultChatTransport({
      api: '/api/humphry/chat'
    }),
    onError(error) {
      toast.add({
        title: 'Humphry error',
        description: error.message || 'Something went wrong. Please try again.',
        color: 'error'
      })
    },
    onFinish({ messages }) {
      persistMessages(messages)
    }
  })

  return chat
}

export const useHumphryChat = createSharedComposable(useHumphryChatBase)
