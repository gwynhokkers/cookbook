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

function summarizeClientToolStates(messages: UIMessage[]) {
  const toolParts = messages.flatMap((message) =>
    (message.parts ?? [])
      .filter((part) => typeof part.type === 'string' && part.type.startsWith('tool-'))
      .map((part) => ({
        messageId: message.id,
        role: message.role,
        type: part.type,
        state: 'state' in part ? String(part.state) : undefined,
        toolCallId: 'toolCallId' in part ? String(part.toolCallId) : undefined
      }))
  )

  return {
    messageCount: messages.length,
    toolPartCount: toolParts.length,
    unresolvedCount: toolParts.filter((part) =>
      part.state === 'input-available' || part.state === 'input-streaming'
    ).length,
    toolParts
  }
}

function persistMessages(messages: UIMessage[]) {
  if (!import.meta.client) {
    return
  }

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '4744c8'
    },
    body: JSON.stringify({
      sessionId: '4744c8',
      hypothesisId: 'D',
      location: 'useHumphryChat.ts:persistMessages',
      message: 'persisting messages',
      data: summarizeClientToolStates(messages),
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion

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
