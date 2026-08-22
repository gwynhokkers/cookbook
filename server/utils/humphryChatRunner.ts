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
    messages: await convertToModelMessages(uiMessages),
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

            const toolResult = step.toolResults.find((r) => r.toolCallId === toolCall.toolCallId)
            if (toolResult) {
              writer.write({
                type: 'tool-output-available',
                toolCallId: toolCall.toolCallId,
                output: toolResult.output ?? null
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
