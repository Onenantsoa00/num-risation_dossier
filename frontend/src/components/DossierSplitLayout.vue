<template>
  <div class="dossier-workspace" :class="modeClass">
    <aside class="dossier-workspace__left">
      <slot name="left" />
    </aside>
    <section class="dossier-workspace__right">
      <slot name="right" />
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  mode: {
    type: String,
    default: 'preview', // preview | list
  },
})

const modeClass = computed(() => `dossier-workspace--${props.mode}`)
</script>
