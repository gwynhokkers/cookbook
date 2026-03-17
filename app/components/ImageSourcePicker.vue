<template>
  <div class="space-y-2">
    <p v-if="label" class="text-sm font-medium">
      {{ label }}
    </p>
    <div class="flex flex-wrap gap-2">
      <input
        ref="cameraInputRef"
        type="file"
        accept="image/*"
        capture="environment"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onCameraChange"
      >
      <input
        ref="libraryInputRef"
        type="file"
        accept="image/*"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onLibraryChange"
      >
      <UButton
        variant="outline"
        :disabled="disabled"
        icon="i-heroicons-camera"
        @click="cameraInputRef?.click()"
      >
        Take photo
      </UButton>
      <UButton
        variant="outline"
        :disabled="disabled"
        icon="i-heroicons-photo"
        @click="libraryInputRef?.click()"
      >
        Choose from library
      </UButton>
    </div>
    <p v-if="description" class="text-sm text-muted">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: File | FileList | null
    label?: string
    description?: string
    disabled?: boolean
  }>(),
  { disabled: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: File | null]
}>()

const cameraInputRef = ref<HTMLInputElement | null>(null)
const libraryInputRef = ref<HTMLInputElement | null>(null)

const handleFile = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('update:modelValue', file)
  }
  input.value = ''
}

const onCameraChange = (e: Event) => handleFile(e)
const onLibraryChange = (e: Event) => handleFile(e)
</script>
