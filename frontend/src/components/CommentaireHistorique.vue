<template>
  <div v-if="historique && historique.length" class="comment-historique q-mb-sm">
    <div
      v-for="h in historique"
      :key="h.version"
      class="comment-historique__item text-body2"
    >
      <span class="text-weight-medium">Version {{ h.version }} :</span>
      <span class="comment-historique__text">{{ h.commentaire }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  // [{ version: 1, commentaire: "..." }, ...]
  historique: { type: Array, default: () => [] },
});
</script>

<style scoped lang="scss">
.comment-historique {
  border-left: 3px solid $grey-5;
  padding-left: 10px;

  &__item {
    color: $grey-7; // gris : lecture seule, non modifiable
    white-space: pre-wrap;
    padding: 2px 0;
  }

  &__text {
    margin-left: 4px;
  }
}
</style>
