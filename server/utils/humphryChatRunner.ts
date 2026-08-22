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

function summarizeStepToolParts(step: {
  content: Array<{ type: string, toolCallId?: string, error?: unknown, output?: unknown, invalid?: boolean }>
  toolCalls: Array<{ toolCallId: string, toolName: string, input: unknown, invalid?: boolean }>
  toolResults: Array<{ toolCallId: string, output?: unknown }>
}) {
  const toolErrors = step.content
    .filter((part) => part.type === 'tool-error')
    .map((part) => ({
      toolCallId: part.toolCallId,
      error: part.error instanceof Error
        ? part.error.message
        : typeof part.error === 'string'
          ? part.error
          : JSON.stringify(part.error)
    }))

  return {
    contentTypes: step.content.map((part) => part.type),
    toolCallCount: step.toolCalls.length,
    toolResultCount: step.toolResults.length,
    toolErrorCount: toolErrors.length,
    invalidToolCallIds: step.toolCalls
      .filter((call) => call.invalid)
      .map((call) => call.toolCallId),
    toolErrors
  }
}

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
        hypothesisId: 'I',
        location: 'humphryChatRunner.ts:onStepFinish',
        message: 'step finished',
        data: {
          stepNumber: step.stepNumber,
          finishReason: step.finishReason,
          textLength: step.text.length,
          toolCalls: step.toolCalls.map((call) => ({
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            invalid: 'invalid' in call ? Boolean(call.invalid) : false,
            input: call.input
          })),
          ...summarizeStepToolParts(step)
        }
      })
      // #endregion
    }
  })

  const stepSummary = result.steps.map((step) => ({
    stepNumber: step.stepNumber,
    finishReason: step.finishReason,
    textLength: step.text.length,
    ...summarizeStepToolParts(step)
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

            const outcome = findToolOutcome(step, toolCall.toolCallId)

            if (outcome.kind === 'result') {
              writer.write({
                type: 'tool-output-available',
                toolCallId: toolCall.toolCallId,
                output: outcome.output
              })
            } else if (outcome.kind === 'error') {
              // #region agent log
              humphryDebugLog({
                hypothesisId: 'I',
                location: 'humphryChatRunner.ts:replayToolError',
                message: 'replaying tool-error',
                data: {
                  toolCallId: toolCall.toolCallId,
                  toolName: toolCall.toolName,
                  errorText: outcome.errorText
                }
              })
              // #endregion

              writer.write({
                type: 'tool-output-error',
                toolCallId: toolCall.toolCallId,
                errorText: outcome.errorText
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
