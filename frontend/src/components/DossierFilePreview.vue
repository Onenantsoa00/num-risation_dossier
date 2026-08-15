frontend/src/components/DossierFilePreview.vue
<template>
  <div class="file-preview">
    <!-- =========================
         HEADER
         ========================= -->
    <div class="file-preview__header">
      <q-icon :name="icon" size="28px" color="primary" class="q-mr-sm" />

      <div class="col min-width-0">
        <div
          class="text-subtitle2 text-weight-bold ellipsis"
          :title="displayName"
        >
          {{ displayName }}
        </div>

        <div class="text-caption text-grey-7">
          {{ sizeLabel }}

          <span v-if="extension"> · {{ extension.toUpperCase() }} </span>
        </div>
      </div>

      <div class="row items-center no-wrap q-gutter-xs">
        <q-btn
          v-if="canDownload"
          flat
          round
          dense
          icon="download"
          color="primary"
          @click="$emit('download')"
        >
          <q-tooltip> Télécharger </q-tooltip>
        </q-btn>

        <q-btn
          flat
          round
          dense
          :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
          color="primary"
          @click="toggleFullscreen"
        >
          <q-tooltip>
            {{ isFullscreen ? "Quitter le plein écran" : "Plein écran" }}
          </q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- =========================
         BODY
         ========================= -->
    <div class="file-preview__content">
      <!-- CHARGEMENT -->
      <div v-if="loading" class="file-preview__empty">
        <q-spinner color="primary" size="40px" />

        <div class="text-body2 text-grey-7 q-mt-md">
          Chargement du fichier...
        </div>
      </div>

      <!-- AUCUN FICHIER -->
      <div v-else-if="!hasSource" class="file-preview__empty">
        <q-icon name="upload_file" size="64px" color="grey-5" />

        <div class="text-body1 text-grey-7 q-mt-md">
          Sélectionnez un fichier
        </div>

        <div class="text-caption text-grey-5 q-mt-xs">
          Son contenu apparaîtra automatiquement ici
        </div>
      </div>

      <!-- =========================
           PDF
           ========================= -->
      <div v-else-if="kind === 'pdf' && previewUrl" class="pdf-viewer">
        <iframe
          :src="previewUrl"
          class="pdf-viewer__iframe"
          title="Aperçu du document PDF"
        />
      </div>

      <!-- =========================
           IMAGE
           ========================= -->
      <div v-else-if="kind === 'image' && previewUrl" class="image-viewer">
        <img :src="previewUrl" :alt="displayName" class="file-preview__image" />
      </div>

      <!-- =========================
           TEXTE
           ========================= -->
      <div v-else-if="kind === 'text' && textContent" class="text-viewer">
        <pre class="file-preview__text">{{ textContent }}</pre>
      </div>

      <!-- =========================
           ZIP
           ========================= -->
      <div v-else-if="kind === 'zip' && zipEntries.length" class="zip-viewer">
        <div class="text-caption text-grey-7 q-mb-sm">
          {{ zipEntries.length }} fichier(s) dans l'archive
        </div>

        <q-list bordered separator class="rounded-borders bg-white">
          <q-item v-for="entry in zipEntries" :key="entry">
            <q-item-section avatar>
              <q-icon name="insert_drive_file" size="xs" />
            </q-item-section>

            <q-item-section>
              {{ entry }}
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- =========================
           AUTRES FICHIERS
           ========================= -->
      <div v-else class="file-preview__empty">
        <q-icon :name="icon" size="64px" color="grey-4" />

        <div class="text-body2 q-mt-md">Aperçu non disponible</div>

        <div class="text-caption text-grey-6 q-mt-xs">
          Le fichier sera importé tel quel.
        </div>
      </div>
    </div>

    <!-- =========================
         METADATA
         ========================= -->
    <div
      v-if="metadata && Object.keys(metadata).length"
      class="file-preview__meta"
    >
      <div class="text-caption text-weight-bold text-primary q-mb-xs">
        Résumé du dossier
      </div>

      <div class="file-preview__meta-grid">
        <div
          v-for="(val, key) in metadata"
          :key="key"
          class="file-preview__meta-item"
        >
          <span class="text-caption text-grey-7">
            {{ key }}
          </span>

          <span>
            {{ val || "—" }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue";

import JSZip from "jszip";

import {
  formatFileSize,
  getFileExtension,
  getFileKind,
  fileIcon,
} from "src/utils/files";

const props = defineProps({
  file: {
    type: Object,
    default: null,
  },

  remoteUrl: {
    type: String,
    default: null,
  },

  remoteName: {
    type: String,
    default: "",
  },

  remoteSize: {
    type: Number,
    default: null,
  },

  loading: {
    type: Boolean,
    default: false,
  },

  canDownload: {
    type: Boolean,
    default: false,
  },

  metadata: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["download", "fullscreen"]);
const isFullscreen = ref(false);

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;

  emit("fullscreen", isFullscreen.value);
}

const previewUrl = ref(null);

const textContent = ref("");

const zipEntries = ref([]);

const displayName = computed(() => {
  return props.file?.name || props.remoteName || "Aucun fichier";
});

const extension = computed(() => {
  return getFileExtension(displayName.value);
});

const kind = computed(() => {
  return getFileKind(displayName.value);
});

const icon = computed(() => {
  return fileIcon(displayName.value);
});

const hasSource = computed(() => {
  return !!props.file || !!props.remoteUrl;
});

const sizeLabel = computed(() => {
  const size = props.file?.size ?? props.remoteSize;

  return formatFileSize(size);
});

/*
 * Nettoyage des anciennes URLs
 */
function revokeUrl() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);

    previewUrl.value = null;
  }

  textContent.value = "";

  zipEntries.value = [];
}

/*
 * Prévisualisation fichier local
 */
async function loadLocalPreview(file) {
  revokeUrl();

  if (!file) return;

  if (kind.value === "pdf" || kind.value === "image") {
    previewUrl.value = URL.createObjectURL(file);

    return;
  }

  if (kind.value === "text") {
    try {
      textContent.value = await file.text();
    } catch (error) {
      console.error("Erreur lecture fichier texte :", error);

      textContent.value = "";
    }

    return;
  }

  if (kind.value === "zip") {
    try {
      const zip = await JSZip.loadAsync(file);

      zipEntries.value = Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir)
        .sort();
    } catch (error) {
      console.error("Erreur lecture ZIP :", error);

      zipEntries.value = [];
    }
  }
}

/*
 * Fichier local changé
 */
watch(
  () => props.file,

  (file) => {
    loadLocalPreview(file);
  },

  {
    immediate: true,
  },
);

/*
 * URL distante changée
 */
watch(
  () => props.remoteUrl,

  (url) => {
    revokeUrl();

    if (!url) return;

    if (["pdf", "image"].includes(kind.value)) {
      previewUrl.value = url;
    }
  },

  {
    immediate: true,
  },
);

/*
 * Fichier texte distant
 */
watch(
  () => [props.remoteUrl, kind.value],

  async ([url, currentKind]) => {
    if (!url || props.file) {
      return;
    }

    if (currentKind === "text") {
      try {
        const response = await fetch(url);

        textContent.value = await response.text();
      } catch (error) {
        console.error("Erreur lecture fichier distant :", error);

        textContent.value = "";
      }
    }
  },

  {
    immediate: true,
  },
);

onUnmounted(() => {
  revokeUrl();
});
</script>

<style scoped>
.file-preview {
  height: 100%;

  display: flex;

  flex-direction: column;

  background: #eef1f5;

  border-radius: 8px;

  overflow: hidden;
}

/* =========================
   HEADER
   ========================= */

.file-preview__header {
  min-height: 58px;

  padding: 10px 14px;

  background: white;

  border-bottom: 1px solid #e1e5ea;

  display: flex;

  align-items: center;
}

/* =========================
   CONTENT
   ========================= */

.file-preview__content {
  flex: 1;

  min-height: 0;

  overflow: hidden;

  position: relative;
}

/* =========================
   EMPTY
   ========================= */

.file-preview__empty {
  width: 100%;

  height: 100%;

  min-height: 300px;

  display: flex;

  flex-direction: column;

  justify-content: center;

  align-items: center;

  text-align: center;

  padding: 30px;
}

/* =========================
   PDF
   ========================= */

.pdf-viewer {
  width: 100%;

  height: 100%;

  overflow: hidden;

  background: #525659;
}

.pdf-viewer__iframe {
  display: block;

  width: 100%;

  height: 100%;

  border: none;
}

/* =========================
   IMAGE
   ========================= */

.image-viewer {
  width: 100%;

  height: 100%;

  overflow: auto;

  padding: 20px;

  display: flex;

  justify-content: center;

  align-items: flex-start;
}

.file-preview__image {
  max-width: 100%;

  height: auto;

  object-fit: contain;

  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

/* =========================
   TEXT
   ========================= */

.text-viewer {
  width: 100%;

  height: 100%;

  overflow: auto;

  background: white;

  padding: 20px;
}

.file-preview__text {
  margin: 0;

  white-space: pre-wrap;

  word-break: break-word;

  font-family: monospace;
}

/* =========================
   ZIP
   ========================= */

.zip-viewer {
  width: 100%;

  height: 100%;

  overflow-y: auto;

  padding: 20px;
}

/* =========================
   META
   ========================= */

.file-preview__meta {
  background: white;

  border-top: 1px solid #e1e5ea;

  padding: 12px;
}

.file-preview__meta-grid {
  display: grid;

  grid-template-columns: repeat(2, minmax(0, 1fr));

  gap: 8px;
}

.file-preview__meta-item {
  display: flex;

  flex-direction: column;

  gap: 2px;
}

/* =========================
   MOBILE
   ========================= */

@media (max-width: 600px) {
  .file-preview__meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
