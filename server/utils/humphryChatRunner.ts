import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateText,
  isStepCount,
  type UIMessage
} from 'ai'
import type { H3Event } from 'h3'
import { HUMPHRY_SYSTEM_PROMPT } from './humphryPrompt'
import { createHumphryTools } from './humphryTools'
import { getWorkersAiModel } from './workersAiModel'

function findToolOutcome(
  step: {
    content: Array<{ type: string, toolCallId?: string, error?: unknown, output?: unknown }>
    toolResults: Array<{ toolCallId: string, output?: unknown }>
  },
  toolCallId: string
) {
  const fromContent = step.content.find((part) =>
    part.toolCallId === toolCallId
    && (part.type === 'tool-result' || part.type === 'tool-error')
  )

  if (fromContent?.type === 'tool-result') {
    return { kind: 'result' as const, output: fromContent.output ?? null }
  }

  if (fromContent?.type === 'tool-error') {
    const errorText = fromContent.error instanceof Error
      ? fromContent.error.message
      : typeof fromContent.error === 'string'
        ? fromContent.error
        : JSON.stringify(fromContent.error)
    return { kind: 'error' as const, errorText }
  }

  const fromResults = step.toolResults.find((result) => result.toolCallId === toolCallId)
  if (fromResults) {
    return { kind: 'result' as const, output: fromResults.output ?? null }
  }

  return { kind: 'missing' as const }
}

export async function createHumphryChatResponse(
  event: H3Event,
  uiMessages: UIMessage[],
  userId: string
) {
  const config = useRuntimeConfig(event)
  const model = getWorkersAiModel(event, String(config.humphryModel))
  const maxSteps = Number(config.humphryMaxToolSteps || 8)
  const tools = createHumphryTools(event, userId)

  const result = await generateText({
    model,
    system: HUMPHRY_SYSTEM_PROMPT,
    messages: await convertToModelMessages(uiMessages, {
      tools,
      ignoreIncompleteToolCalls: true
    }),
    tools,
    stopWhen: isStepCount(maxSteps),
    maxOutputTokens: 4096
  })

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: uiMessages,
      execute: ({ writer }) => {
        writer.write({ type: 'start' })

        for (const step of result.steps) {
          writer.write({ type: 'start-step' })

          for (const toolCall of step.toolCalls) {
            writer.write({
              type: 'tool-input-available',
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input
            })

            const outcome = findToolOutcome(step, toolCall.toolCallId)

            if (outcome.kind === 'result') {
              writer.write({
                type: 'tool-output-available',
                toolCallId: toolCall.toolCallId,
                output: outcome.output
              })
            } else if (outcome.kind === 'error') {
              writer.write({
                type: 'tool-output-error',
                toolCallId: toolCall.toolCallId,
                errorText: outcome.errorText
              })
            } else {
              writer.write({
                type: 'tool-output-error',
                toolCallId: toolCall.toolCallId,
                errorText: 'Tool execution did not complete'
              })
            }
          }

          writer.write({ type: 'finish-step' })
        }

        if (result.text) {
          const id = generateId()
          writer.write({ type: 'text-start', id })
          writer.write({ type: 'text-delta', id, delta: result.text })
          writer.write({ type: 'text-end', id })
        }

        writer.write({ type: 'finish', finishReason: result.finishReason })
      }
    })
  })
}
