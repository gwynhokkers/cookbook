<script setup lang="ts">
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

type CropperInstance = InstanceType<typeof Cropper>

const props = defineProps<{
  imageSrc: string
}>()

type TriRegionPayload = { title: Blob, ingredients: Blob, method: Blob }

const emit = defineEmits<{
  complete: [TriRegionPayload]
  cancel: []
}>()

const imgRef = ref<HTMLImageElement | null>(null)
let cropper: CropperInstance | null = null

const currentStep = ref(0)
const stepLabels = [
  'Title and introduction — drag the box to cover the recipe name and any intro text.',
  'Ingredients — cover the full ingredient list only.',
  'Method — cover the cooking instructions / steps only.'
]

function destroyCropper() {
  cropper?.destroy()
  cropper = null
}

function initCropper() {
  destroyCropper()
  const el = imgRef.value
  if (!el || !el.complete || el.naturalWidth === 0) {
    return
  }
  cropper = new Cropper(el, {
    viewMode: 1,
    autoCropArea: 0.85,
    responsive: true,
    background: false
  })
}

function onImgLoad() {
  nextTick(() => initCropper())
}

watch(
  () => props.imageSrc,
  () => {
    currentStep.value = 0
    nextTick(() => {
      destroyCropper()
      nextTick(() => initCropper())
    })
  }
)

onMounted(() => {
  nextTick(() => {
    if (imgRef.value?.complete && imgRef.value.naturalWidth > 0) {
      initCropper()
    }
  })
})

onBeforeUnmount(() => {
  destroyCropper()
})

const blobs = ref<(Blob | null)[]>([null, null, null])

function confirmCrop() {
  if (!cropper) {
    return
  }
  const canvas = cropper.getCroppedCanvas({
    maxWidth: 1600,
    maxHeight: 1600,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  })
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        return
      }
      blobs.value[currentStep.value] = blob
      if (currentStep.value < 2) {
        currentStep.value += 1
        destroyCropper()
        nextTick(() => initCropper())
      } else {
        const t = blobs.value[0]
        const i = blobs.value[1]
        const m = blobs.value[2]
        if (t && i && m) {
          emit('complete', { title: t, ingredients: i, method: m })
        }
      }
    },
    'image/jpeg',
    0.88
  )
}

function goBack() {
  if (currentStep.value <= 0) {
    return
  }
  blobs.value[currentStep.value - 1] = null
  currentStep.value -= 1
  destroyCropper()
  nextTick(() => initCropper())
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm font-medium text-default">
      {{ stepLabels[currentStep] }}
    </p>
    <p class="text-xs text-muted">
      Region {{ currentStep + 1 }} of 3 — adjust the crop box, then continue.
    </p>
    <div class="max-h-[min(70vh,560px)] overflow-auto rounded-lg border border-default bg-elevated p-2">
      <img
        ref="imgRef"
        :src="imageSrc"
        alt="Recipe page to crop"
        class="block max-h-[50vh] max-w-full"
        @load="onImgLoad"
      />
    </div>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <UButton type="button" variant="ghost" @click="emit('cancel')">
        Cancel
      </UButton>
      <UButton
        v-if="currentStep > 0"
        type="button"
        variant="outline"
        @click="goBack"
      >
        Back
      </UButton>
      <UButton type="button" @click="confirmCrop">
        {{ currentStep < 2 ? 'Next region' : 'Use these crops' }}
      </UButton>
    </div>
  </div>
</template>
