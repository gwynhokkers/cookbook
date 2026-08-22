<script setup lang="ts">
import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIMessage
} from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'
import shiki from '@comark/nuxt/plugins/shiki'
import type { HumphryRecipeSummary } from '~~/shared/utils/humphryTypes'

const props = defineProps<{
  compact?: boolean
}>()

const input = ref('')
const { messages, status, error, sendMessage, regenerate, stop } = useHumphryChat()

function onSubmit() {
  const text = input.value.trim()
  if (!text) {
    return
  }

  sendMessage({ text })
  input.value = ''
}

function extractRecipesFromMessage(message: UIMessage): HumphryRecipeSummary[] {
  const recipes: HumphryRecipeSummary[] = []
  const seen = new Set<string>()

  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== 'output-available') {
      continue
    }

    const toolName = getToolName(part)
    if (!['search_recipes', 'list_favorites', 'get_recipe_details'].includes(toolName)) {
      continue
    }

    const output = part.output as Record<string, unknown> | undefined
    if (!output) {
      continue
    }

    const list = Array.isArray(output.recipes)
      ? output.recipes as HumphryRecipeSummary[]
      : output.id
        ? [output as unknown as HumphryRecipeSummary]
        : []

    for (const recipe of list) {
      if (recipe?.id && !seen.has(recipe.id)) {
        seen.add(recipe.id)
        recipes.push({
          id: recipe.id,
          title: recipe.title,
          description: recipe.description ?? null,
          imageUrl: recipe.imageUrl ?? null,
          tags: recipe.tags || []
        })
      }
    }
  }

  return recipes
}

const markdownClass = '*:first:mt-0 *:last:mb-0'
</script>

<template>
  <UChatPalette :class="compact ? 'h-full min-h-0' : 'h-[min(70vh,42rem)]'">
    <UChatMessages
      :messages="messages"
      :status="status"
      :should-auto-scroll="true"
      :compact="compact"
      :assistant="{ icon: 'i-lucide-chef-hat', label: 'Humphry', variant: 'naked' }"
      :user="{ side: 'right', variant: 'soft' }"
      class="min-h-0 flex-1"
    >
      <template #content="{ message }">
        <div class="space-y-3">
          <template
            v-for="(part, index) in message.parts"
            :key="`${message.id}-${part.type}-${index}`"
          >
            <UChatTool
              v-if="isToolUIPart(part)"
              :text="getToolName(part).replaceAll('_', ' ')"
              :streaming="isToolStreaming(part)"
            />

            <template v-else-if="isTextUIPart(part)">
              <Markdown
                v-if="message.role === 'assistant'"
                :value="part.text"
                :streaming="isPartStreaming(part)"
                :plugins="[shiki()]"
                :class="markdownClass"
              />
              <p
                v-else-if="message.role === 'user'"
                class="whitespace-pre-wrap"
              >
                {{ part.text }}
              </p>
            </template>
          </template>

          <HumphryRecipeCards
            v-if="message.role === 'assistant'"
            :recipes="extractRecipesFromMessage(message)"
          />
        </div>
      </template>
    </UChatMessages>

    <template #prompt>
      <UChatPrompt
        v-model="input"
        placeholder="Ask Humphry what to cook…"
        :error="error"
        @submit="onSubmit"
      >
        <UChatPromptSubmit
          :status="status"
          @stop="stop()"
          @reload="regenerate()"
        />
      </UChatPrompt>
    </template>
  </UChatPalette>
</template>
