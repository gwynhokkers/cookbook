<script setup lang="ts">
defineProps({
  eyebrow: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: false, default: '' }
})
</script>

<template>
  <div
    class="flex h-full w-full overflow-hidden bg-[#060a0f] text-[#e8eef0]"
    style="font-family: Outfit, ui-sans-serif, system-ui, sans-serif;"
  >
    <div
      class="flex w-[34%] items-center justify-center"
      style="background: linear-gradient(160deg, #004645, #060a0f);"
    >
      <img src="/inky-chef-white.svg" alt="" width="280" height="280">
    </div>
    <div class="flex flex-1 flex-col justify-between p-14">
      <p class="m-0 text-sm uppercase tracking-[0.28em] text-[#00ccca]">
        {{ eyebrow }}
      </p>
      <div>
        <h1
          class="m-0 text-[64px] font-normal leading-[1.05] text-[#f0f4f6]"
          style="font-family: Italiana, Outfit, ui-sans-serif, serif;"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="m-0 mt-6 max-w-[680px] text-[28px] leading-snug text-[#a8b8c4]"
        >
          {{ description }}
        </p>
      </div>
      <p class="m-0 text-lg text-[#5a6d7d]">
        cookbook.megwyn.co.uk
      </p>
    </div>
  </div>
</template>
