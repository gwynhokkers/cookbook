<template>
  <div class="space-y-4">
    <UInput
      type="file"
      accept="image/*"
      @change="handleFileSelect"
      :disabled="uploading"
    />
    
    <div v-if="previewUrl" class="relative">
      <img
        :src="previewUrl"
        alt="Preview"
        class="w-full max-w-md rounded-lg"
      />
      <UButton
        v-if="!uploading"
        icon="i-heroicons-x-mark"
        color="red"
        variant="solid"
        class="absolute top-2 right-2"
        @click="clearImage"
      />
    </div>

    <div v-if="uploading" class="flex items-center gap-2">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
      <span>Uploading...</span>
    </div>

    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      :title="error"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const previewUrl = ref<string | null>(props.modelValue || null)
const uploading = ref(false)
const error = ref<string | null>(null)

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  
  if (!file) return

  error.value = null

  // Create preview
  const reader = new FileReader()
  reader.onload = (e) => {
    previewUrl.value = e.target?.result as string
  }
  reader.readAsDataURL(file)

  // Upload file
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('image', file)

    const result = await $fetch<{ url: string; path: string }>('/api/recipes/upload', {
      method: 'POST',
      body: formData
    })

    emit('update:modelValue', result.url)
  } catch (err: any) {
    error.value = err.message || 'Failed to upload image'
    previewUrl.value = null
  } finally {
    uploading.value = false
  }
}

const clearImage = () => {
  previewUrl.value = null
  emit('update:modelValue', null)
}

watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    previewUrl.value = newValue
  } else {
    previewUrl.value = null
  }
})
</script>
