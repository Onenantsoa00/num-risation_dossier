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

  grid-template-columns:
    minmax(0, 1.65fr)
    minmax(380px, 0.85fr);

  gap: 16px;

  width: 100%;

  align-items: start;
}

/* =========================
   MODE NORMAL
   ========================= */

.dossier-workspace__left {
  min-width: 0;
  width: 100%;
}

.dossier-workspace__right {
  min-width: 0;
  width: 100%;
}

/*
 * Hauteur normale du document
 */
.dossier-workspace--preview .dossier-workspace__left {
  min-height: calc(100vh - 230px);
}

.dossier-workspace--preview .dossier-workspace__left :deep(.file-preview) {
  height: calc(100vh - 230px);
  min-height: 600px;
}

/*
 * Panneau droit sticky en mode normal
 */
.dossier-workspace--preview .dossier-workspace__right {
  position: sticky;
  top: 16px;

  max-height: calc(100vh - 180px);

  overflow-y: auto;
}

/* =========================
   MODE PLEIN ÉCRAN
   ========================= */

.dossier-workspace--fullscreen {
  position: fixed;

  inset: 0;

  z-index: 2000;

  display: grid;

  grid-template-columns: 1fr;

  grid-template-rows:
    minmax(0, 1fr)
    auto;

  gap: 0;

  background: #111;

  width: 100vw;
  height: 100vh;

  padding: 0;
}

/*
 * Document en haut
 */
.dossier-workspace--fullscreen .dossier-workspace__left {
  min-height: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;

  background: #202124;

  display: flex;
  flex-direction: column;
}

/*
 * Le lecteur prend toute la zone haute
 */
.dossier-workspace--fullscreen .dossier-workspace__left :deep(.file-preview) {
  height: 100%;

  min-height: 0;

  border-radius: 0;
}

/*
 * Le panneau d'actions devient la zone basse
 */
.dossier-workspace--fullscreen .dossier-workspace__right {
  width: 100%;

  max-height: 42vh;

  overflow-y: auto;

  position: relative;

  top: auto;

  background: white;

  border-top: 1px solid #d9d9d9;
}

/*
 * Affichage plus compact en plein écran
 */
.dossier-workspace--fullscreen .dossier-workspace__right :deep(.sticky-panel) {
  border-radius: 0;

  box-shadow: none;

  padding: 16px;
}

/* =========================
   TABLETTE
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

/* =========================
   PETIT ÉCRAN
   ========================= */

@media (max-width: 600px) {
  .dossier-workspace--fullscreen {
    grid-template-rows:
      minmax(0, 1fr)
      auto;
  }

  .dossier-workspace--fullscreen .dossier-workspace__right {
    max-height: 40vh;
  }
}
</style>
