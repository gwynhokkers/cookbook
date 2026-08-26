<script setup lang="ts">
import { getToolName, isTextUIPart, isToolUIPart, type UIMessage } from "ai";
import { isPartStreaming, isToolStreaming } from "@nuxt/ui/utils/ai";
import shiki from "@comark/nuxt/plugins/shiki";
import type { HumphryRecipeSummary } from "~~/shared/utils/humphryTypes";

const props = defineProps<{
  compact?: boolean;
}>();

const input = ref("");
const {
  messages,
  status,
  error,
  sendMessage,
  regenerate,
  stop,
  sessions,
  activeSessionId,
  sessionsLoading,
  searchQuery,
  createSession,
  selectSession,
  deleteSession,
  ensureReady,
} = useHumphryChat();

onMounted(() => {
  ensureReady().catch(() => {
    /* toast handled in chat errors */
  });
});

function onSubmit() {
  const text = input.value.trim();
  if (!text || !activeSessionId.value) {
    return;
  }

  sendMessage({ text });
  input.value = "";
}

async function onNewChat() {
  await createSession();
  input.value = "";
}

async function onSelectSession(sessionId: string) {
  await selectSession(sessionId);
}

async function onDeleteSession(sessionId: string, event: Event) {
  event.stopPropagation();
  if (!confirm("Delete this chat session?")) {
    return;
  }
  await deleteSession(sessionId);
}

function extractRecipesFromMessage(message: UIMessage): HumphryRecipeSummary[] {
  const recipes: HumphryRecipeSummary[] = [];
  const seen = new Set<string>();

  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") {
      continue;
    }

    const toolName = getToolName(part);
    if (
      ![
        "search_recipes",
        "list_favorites",
        "get_recipe_details",
        "generate_shopping_list",
        "get_shopping_list",
        "set_shopping_list_recipes",
      ].includes(toolName)
    ) {
      continue;
    }

    const output = part.output as Record<string, unknown> | undefined;
    if (!output) {
      continue;
    }

    const list = Array.isArray(output.recipes)
      ? (output.recipes as HumphryRecipeSummary[])
      : output.id
        ? [output as unknown as HumphryRecipeSummary]
        : [];

    for (const recipe of list) {
      if (recipe?.id && !seen.has(recipe.id)) {
        seen.add(recipe.id);
        recipes.push({
          id: recipe.id,
          title: recipe.title,
          description: recipe.description ?? null,
          imageUrl: recipe.imageUrl ?? null,
          tags: recipe.tags || [],
        });
      }
    }
  }

  return recipes;
}

const markdownClass = "*:first:mt-0 *:last:mb-0";
</script>

<template>
  <div
    :class="
      compact
        ? 'flex h-full min-h-0 flex-col gap-2'
        : 'flex h-[min(70vh,42rem)] flex-col gap-3'
    "
  >
    <div class="no-print flex shrink-0 flex-col gap-2">
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search chats…"
          size="sm"
          class="flex-1"
        />
        <UButton
          icon="i-lucide-plus"
          size="sm"
          variant="soft"
          aria-label="New chat"
          @click="onNewChat"
        />
      </div>

      <div class="flex gap-1 overflow-x-auto pb-1">
        <div
          v-if="sessionsLoading && !sessions.length"
          class="px-2 text-xs text-muted"
        >
          Loading chats…
        </div>
        <button
          v-for="session in sessions"
          :key="session.id"
          type="button"
          class="group inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-3 py-1 text-left text-xs transition"
          :class="
            session.id === activeSessionId
              ? 'border-primary bg-primary/10 text-highlighted'
              : 'border-default text-muted hover:bg-elevated'
          "
          @click="onSelectSession(session.id)"
        >
          <span class="truncate">{{ session.title }}</span>
          <span
            class="rounded-full p-0.5 opacity-60 hover:bg-error/20 hover:text-error hover:opacity-100"
            role="button"
            tabindex="0"
            aria-label="Delete chat"
            @click="onDeleteSession(session.id, $event)"
            @keydown.enter.prevent="onDeleteSession(session.id, $event)"
          >
            <UIcon
              name="i-lucide-x"
              class="size-3"
            />
          </span>
        </button>
      </div>
    </div>

    <UChatPalette class="min-h-0 flex-1">
      <UChatMessages
        :messages="messages"
        :status="status"
        :should-auto-scroll="true"
        :compact="compact"
        :assistant="{
          icon: 'i-lucide-chef-hat',
          label: 'Humphry',
          variant: 'naked',
        }"
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
          placeholder="Ask Humphry what to cook or build a shopping list…"
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
  </div>
</template>
