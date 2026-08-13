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
import { computed } from "vue";

const props = defineProps({
  mode: {
    type: String,
    default: "preview",
  },
});

const modeClass = computed(() => `dossier-workspace--${props.mode}`);
</script>

<style scoped>
.dossier-workspace {
  display: grid;

  /* gauche plus large que droite */
  grid-template-columns: minmax(0, 1.65fr) minmax(380px, 0.85fr);

  gap: 16px;

  width: 100%;

  align-items: start;
}

.dossier-workspace__left {
  min-width: 0;
  width: 100%;
}

.dossier-workspace__right {
  min-width: 0;
  width: 100%;
}

/*
 * Très important :
 * donne une vraie hauteur à la zone gauche.
 */
.dossier-workspace--preview .dossier-workspace__left {
  min-height: calc(100vh - 230px);
}

/*
 * Le DossierFilePreview doit pouvoir prendre toute
 * la hauteur disponible.
 */
.dossier-workspace--preview .dossier-workspace__left :deep(.file-preview) {
  height: calc(100vh - 230px);
  min-height: 600px;
}

/*
 * Le contenu PDF/image prend toute la place.
 */
.dossier-workspace--preview
  .dossier-workspace__left
  :deep(.file-preview__content) {
  min-height: 0;
}

/*
 * Le panneau de droite reste visible pendant le scroll.
 */
.dossier-workspace--preview .dossier-workspace__right {
  position: sticky;
  top: 16px;

  max-height: calc(100vh - 180px);

  overflow-y: auto;
}

/* =========================
   TABLETTE / PETIT ÉCRAN
   ========================= */

@media (max-width: 1000px) {
  .dossier-workspace {
    grid-template-columns: 1fr;
  }

  .dossier-workspace--preview .dossier-workspace__right {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .dossier-workspace--preview .dossier-workspace__left {
    min-height: 500px;
  }

  .dossier-workspace--preview .dossier-workspace__left :deep(.file-preview) {
    height: 600px;
    min-height: 500px;
  }
}
</style>
