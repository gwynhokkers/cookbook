import type { UIMessage } from 'ai'

type HumphryDebugPayload = {
  location: string
  message: string
  hypothesisId: string
  data?: Record<string, unknown>
  runId?: string
}

export function humphryDebugLog(payload: HumphryDebugPayload) {
  const body = {
    sessionId: '4744c8',
    timestamp: Date.now(),
    ...payload
  }

  // #region agent log
  fetch('http://127.0.0.1:7596/ingest/f00dd2c9-dd1d-440f-a637-fdc99e4efb0a', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '4744c8'
    },
    body: JSON.stringify(body)
  }).catch(() => {})
  // #endregion

  console.error('[humphry-debug]', JSON.stringify(body))
}

export function summarizeHumphryToolStates(messages: UIMessage[]) {
  const toolParts: Array<{
    messageId: string
    role: string
    toolCallId?: string
    type?: string
    state?: string
    toolName?: string
  }> = []

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
        toolParts.push({
          messageId: message.id,
          role: message.role,
          toolCallId: 'toolCallId' in part ? String(part.toolCallId) : undefined,
          type: part.type,
          state: 'state' in part ? String(part.state) : undefined,
          toolName: part.type === 'dynamic-tool' && 'toolName' in part
            ? String(part.toolName)
            : part.type.replace(/^tool-/, '')
        })
      }
    }
  }

  const unresolved = toolParts.filter((part) =>
    part.state === 'input-available'
    || part.state === 'input-streaming'
    || part.state === 'approval-requested'
  )

  return {
    messageCount: messages.length,
    toolPartCount: toolParts.length,
    unresolvedCount: unresolved.length,
    unresolvedIds: unresolved.map((part) => part.toolCallId).filter(Boolean),
    toolParts
  }
}
