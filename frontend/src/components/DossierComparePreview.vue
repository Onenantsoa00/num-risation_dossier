<template>
  <div class="compare-preview" :class="{ 'compare-preview--fullscreen': fullscreen }">
    <div class="compare-toolbar">
      <div class="compare-labels">
        <q-badge color="negative" class="compare-badge compare-badge--old">
          Ancien dossier
        </q-badge>
        <q-badge color="positive" class="compare-badge compare-badge--new">
          Nouveau dossier
        </q-badge>
      </div>

      <q-btn
        flat
        round
        dense
        :icon="fullscreen ? 'fullscreen_exit' : 'fullscreen'"
        color="primary"
        @click="$emit('toggle-fullscreen')"
      >
        <q-tooltip>
          {{ fullscreen ? "Quitter le plein écran" : "Plein écran" }}
        </q-tooltip>
      </q-btn>
    </div>

    <div class="compare-grid">
      <div class="compare-panel compare-panel--old">
        <div class="compare-panel__title text-negative">Ancien dossier</div>
        <DossierFilePreview
          :remote-url="oldPreviewUrl"
          :remote-name="oldFileName"
          :loading="oldLoading"
          can-download
          hide-fullscreen
          @download="$emit('download-old')"
        />
      </div>

      <div class="compare-panel compare-panel--new">
        <div class="compare-panel__title text-positive">Nouveau dossier</div>
        <DossierFilePreview
          :remote-url="newPreviewUrl"
          :remote-name="newFileName"
          :loading="newLoading"
          can-download
          hide-fullscreen
          @download="$emit('download-new')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import DossierFilePreview from "components/DossierFilePreview.vue";

defineProps({
  oldPreviewUrl: { type: String, default: null },
  newPreviewUrl: { type: String, default: null },
  oldFileName: { type: String, default: "" },
  newFileName: { type: String, default: "" },
  oldLoading: { type: Boolean, default: false },
  newLoading: { type: Boolean, default: false },
  fullscreen: { type: Boolean, default: false },
});

defineEmits(["download-old", "download-new", "toggle-fullscreen"]);
</script>

<style scoped>
.compare-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.compare-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 4px 10px;
  flex-shrink: 0;
}

.compare-labels {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.compare-badge {
  font-size: 12px;
  padding: 6px 10px;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.compare-panel {
  min-width: 0;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: white;
}

.compare-panel__title {
  font-size: 12px;
  font-weight: 700;
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.compare-panel--old {
  border: 2px solid #ef4444;
}

.compare-panel--new {
  border: 2px solid #22c55e;
}

.compare-panel :deep(.file-preview) {
  flex: 1;
  min-height: 400px;
  height: calc(100vh - 300px);
}

.compare-preview--fullscreen .compare-panel :deep(.file-preview) {
  height: 100%;
  min-height: 0;
}

.compare-preview--fullscreen {
  height: 100%;
}

@media (max-width: 900px) {
  .compare-grid {
    grid-template-columns: 1fr;
  }

  .compare-labels {
    display: none;
  }
}
</style>
