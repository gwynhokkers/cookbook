<template>
  <div class="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
    <div>
      <h3 class="text-base font-semibold">Scan cookbook page (AI prefill)</h3>
      <p class="text-sm text-muted">
        Upload a photo/scan of a recipe page and we will prefill this form automatically.
      </p>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <UFormField label="Cookbook page image">
        <ImageSourcePicker
          v-model="extractionFile"
          description="Take a photo or choose from library. One recipe per image, max 8MB (JPG/PNG/WEBP/GIF)."
        />
        <div v-if="extractionPreviewUrl" class="mt-3 rounded-lg border border-default p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium truncate">
              {{ extractionPreviewFileName || 'Selected image' }}
            </p>
            <UButton
              type="button"
              size="xs"
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="clearExtractionFile"
            >
              Remove
            </UButton>
          </div>
          <NuxtImg
            :src="extractionPreviewUrl"
            alt="Selected cookbook page preview"
            class="w-full max-w-sm rounded-md border border-default object-cover"
            width="480"
            height="320"
            loading="lazy"
          />
          <p class="text-xs text-muted">
            {{ extractionPreviewFileSizeText }}
          </p>
          <p v-if="extractionCompressionNote" class="text-xs text-muted">
            {{ extractionCompressionNote }}
          </p>
        </div>
      </UFormField>

      <UFormField label="Optional method image">
        <ImageSourcePicker
          v-model="extractionMethodFile"
          description="If you use a single full-page scan (not three-region), add a second photo of the method column to improve steps."
        />
        <p v-if="extractionMethodCompressionNote" class="mt-2 text-xs text-muted">
          {{ extractionMethodCompressionNote }}
        </p>
      </UFormField>

      <UFormField
        label="Apply mode"
        help="Fill empty keeps your existing values. Replace all overwrites title, description, ingredients, and steps."
      >
        <USelect
          v-model="extractionApplyMode"
          :items="[
            { label: 'Fill empty fields', value: 'fill-empty' },
            { label: 'Replace all recipe fields', value: 'replace-all' }
          ]"
        />
      </UFormField>

      <div
        v-if="extractionPreviewUrl"
        class="space-y-2 rounded-lg border border-dashed border-default p-3 md:col-span-2"
      >
        <p class="text-sm text-muted">
          Dense or two-column pages: crop this image into three regions (title, ingredients, method) so the AI reads each part clearly. This runs three focused scans instead of one full page.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            type="button"
            variant="outline"
            size="sm"
            @click="regionCropModalOpen = true"
          >
            Crop title, ingredients &amp; method
          </UButton>
          <UButton
            v-if="triRegionCrops"
            type="button"
            variant="ghost"
            size="sm"
            @click="clearTriRegionCrops"
          >
            Clear region crops
          </UButton>
        </div>
        <p v-if="triRegionCrops" class="text-xs text-primary">
          Three region crops are ready — Scan and prefill will use them instead of the full page image.
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UButton
        type="button"
        icon="i-heroicons-sparkles"
        size="lg"
        class="w-full justify-center sm:w-auto"
        :loading="extractingRecipe"
        :disabled="!hasExtractionFile || extractingRecipe || formBusy"
        @click="onScanAndPrefill"
      >
        Scan and prefill
      </UButton>
      <UButton
        type="button"
        variant="outline"
        size="lg"
        class="w-full justify-center sm:w-auto"
        :disabled="!hasExtractionFile || extractingRecipe"
        @click="clearExtractionFile"
      >
        Clear image
      </UButton>
    </div>

    <UAlert
      v-if="extractionError"
      color="error"
      variant="soft"
      :title="extractionError"
    />
    <UAlert
      v-if="extractionSummary"
      color="success"
      variant="soft"
      :title="extractionSummary"
    />
    <div v-if="hydratingPrefilledIngredients" class="flex items-center gap-2 text-xs text-muted">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
      <span>Matching extracted ingredients to your ingredient library...</span>
    </div>

    <Teleport to="body">
      <div
        v-if="regionCropModalOpen && extractionPreviewUrl"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        @click.self="regionCropModalOpen = false"
      >
        <div class="bg-default max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-default p-4 shadow-xl">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h4 class="text-sm font-semibold">
              Define three regions
            </h4>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              size="xs"
              @click="regionCropModalOpen = false"
            />
          </div>
          <RecipePageRegionCropper
            :image-src="extractionPreviewUrl"
            @complete="onRegionCropsComplete"
            @cancel="regionCropModalOpen = false"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  useRecipePrefill,
  type RecipePrefillFormSnapshot,
  type RecipePrefillPatch
} from '~/composables/useRecipePrefill'

const props = defineProps<{
  isEdit?: boolean
  formSnapshot: RecipePrefillFormSnapshot
  formBusy?: boolean
}>()

const emit = defineEmits<{
  prefill: [patch: RecipePrefillPatch]
}>()

const {
  extractionFile,
  extractionMethodFile,
  extractionApplyMode,
  extractingRecipe,
  extractionError,
  extractionSummary,
  hydratingPrefilledIngredients,
  extractionPreviewUrl,
  extractionCompressionNote,
  extractionMethodCompressionNote,
  triRegionCrops,
  regionCropModalOpen,
  extractionPreviewFileName,
  extractionPreviewFileSizeText,
  hasExtractionFile,
  clearTriRegionCrops,
  onRegionCropsComplete,
  clearExtractionFile,
  extractAndPrefill
} = useRecipePrefill({
  isEdit: () => props.isEdit,
  formSnapshot: () => props.formSnapshot
})

const onScanAndPrefill = async () => {
  const patch = await extractAndPrefill()
  if (patch) {
    emit('prefill', patch)
  }
}
</script>
