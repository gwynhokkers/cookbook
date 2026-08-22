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
import { humphryDebugLog, summarizeHumphryToolStates } from './humphryDebugLog'
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
  const incomingToolSummary = summarizeHumphryToolStates(uiMessages)

  // #region agent log
  humphryDebugLog({
    hypothesisId: 'A',
    location: 'humphryChatRunner.ts:beforeGenerate',
    message: 'before generateText',
    data: {
      maxSteps,
      usesBinding: !!event.context?.cloudflare?.env?.AI,
      ...incomingToolSummary
    }
  })
  // #endregion

  const result = await generateText({
    model,
    system: HUMPHRY_SYSTEM_PROMPT,
    messages: await convertToModelMessages(uiMessages, {
      tools,
      ignoreIncompleteToolCalls: true
    }),
    tools,
    stopWhen: isStepCount(maxSteps),
    maxOutputTokens: 4096,
    onStepFinish: (step) => {
      // #region agent log
      humphryDebugLog({
        hypothesisId: 'F',
        location: 'humphryChatRunner.ts:onStepFinish',
        message: 'step finished',
        data: {
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          textLength: step.text.length,
          toolCalls: step.toolCalls.map((call) => ({
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            input: call.input
          })),
          toolResults: step.toolResults.map((res) => ({
            toolCallId: res.toolCallId,
            hasOutput: res.output != null
          }))
        }
      })
      // #endregion
    }
  })

  const stepSummary = result.steps.map((step) => ({
    stepNumber: step.stepNumber,
    finishReason: step.finishReason,
    toolCallCount: step.toolCalls.length,
    toolResultCount: step.toolResults.length,
    toolCallIds: step.toolCalls.map((call) => call.toolCallId),
    toolResultIds: step.toolResults.map((res) => res.toolCallId),
    missingResultIds: step.toolCalls
      .filter((call) => !step.toolResults.some((res) => res.toolCallId === call.toolCallId))
      .map((call) => call.toolCallId),
    textLength: step.text.length
  }))

  // #region agent log
  humphryDebugLog({
    hypothesisId: 'B',
    location: 'humphryChatRunner.ts:afterGenerate',
    message: 'generateText finished',
    data: {
      finishReason: result.finishReason,
      textLength: result.text.length,
      stepCount: result.steps.length,
      steps: stepSummary
    }
  })
  // #endregion

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
            } else {
              // #region agent log
              humphryDebugLog({
                hypothesisId: 'B',
                location: 'humphryChatRunner.ts:replayMissingOutput',
                message: 'tool call missing result during replay',
                data: {
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName
                }
              })
              // #endregion

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
