<template>
  <div class="pdf-editor">
    <!-- =========================
         TOOLBAR
         ========================= -->
    <div class="pdf-editor__toolbar">
      <q-btn
        flat
        round
        dense
        icon="chevron_left"
        :disable="pageNum <= 1 || loading || loadError"
        @click="goPage(pageNum - 1)"
      >
        <q-tooltip> Page précédente </q-tooltip>
      </q-btn>

      <span class="pdf-editor__pageinfo">
        {{ pageNum }} / {{ numPages }}
      </span>

      <q-btn
        flat
        round
        dense
        icon="chevron_right"
        :disable="pageNum >= numPages || loading || loadError"
        @click="goPage(pageNum + 1)"
      >
        <q-tooltip> Page suivante </q-tooltip>
      </q-btn>

      <q-separator vertical class="q-mx-xs" />

      <q-btn
        flat
        round
        dense
        icon="zoom_out"
        :disable="loading || loadError"
        @click="zoom(0.8)"
      >
        <q-tooltip> Zoom arrière </q-tooltip>
      </q-btn>

      <span class="pdf-editor__zoom">{{ Math.round(scale * 100) }}%</span>

      <q-btn
        flat
        round
        dense
        icon="zoom_in"
        :disable="loading || loadError"
        @click="zoom(1.25)"
      >
        <q-tooltip> Zoom avant </q-tooltip>
      </q-btn>

      <q-separator vertical class="q-mx-xs" />

      <q-btn
        flat
        dense
        icon="fit_screen"
        label="Ajuster à la page"
        :disable="loading || loadError"
        @click="fitToPage"
      />

      <q-btn
        flat
        dense
        icon="rotate_left"
        label="Faire pivoter vers la gauche"
        :disable="loading || loadError"
        @click="rotate(-90)"
      />

      <q-btn
        flat
        round
        dense
        icon="rotate_right"
        :disable="loading || loadError"
        @click="rotate(90)"
      >
        <q-tooltip> Faire pivoter vers la droite </q-tooltip>
      </q-btn>

      <template v-if="canMove || canDelete">
        <q-separator vertical class="q-mx-xs" />

        <q-btn
          v-if="canMove"
          flat
          dense
          icon="swap_horiz"
          label="Déplacer une page"
          :disable="loading || loadError || saving || numPages < 2"
          @click="openMoveDialog"
        />

        <q-btn
          v-if="canDelete"
          flat
          dense
          icon="delete_outline"
          color="negative"
          label="Supprimer une page"
          :disable="loading || loadError || saving || numPages < 2"
          @click="confirmDeletePage"
        />

        <q-separator vertical class="q-mx-xs" />

        <q-btn
          v-if="dirty"
          unelevated
          color="positive"
          icon="save"
          label="Enregistrer"
          :loading="saving"
          @click="save"
        />
      </template>
    </div>

    <!-- =========================
         VIEWPORT
         ========================= -->
    <div ref="viewportEl" class="pdf-editor__viewport">
      <div v-if="loading" class="pdf-editor__state">
        <q-spinner color="primary" size="36px" />
        <div class="text-caption text-grey-6 q-mt-sm">Chargement du PDF...</div>
      </div>

      <div v-else-if="loadError" class="pdf-editor__state">
        <q-icon name="error_outline" size="48px" color="negative" />
        <div class="text-body2 text-grey-7 q-mt-sm">
          Impossible d'afficher ce PDF avec la visionneuse intégrée.
        </div>
      </div>

      <template v-else>
        <canvas ref="canvasEl" class="pdf-editor__canvas" />

        <div
          v-if="dirty"
          class="pdf-editor__dirty-badge text-caption text-white"
        >
          Modifications non enregistrées
        </div>
      </template>
    </div>

    <!-- =========================
         DIALOGUE : DÉPLACER UNE PAGE
         ========================= -->
    <q-dialog v-model="moveDialog" persistent>
      <q-card style="min-width: 340px">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Déplacer une page</div>
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="text-body2 q-mb-sm">
            Déplacer la page <b>{{ pageNum }}</b> à la position :
          </div>

          <div class="row items-center q-gutter-sm">
            <q-btn
              flat
              round
              dense
              icon="remove"
              :disable="moveTarget <= 1"
              @click="moveTarget--"
            />
            <q-input
              v-model.number="moveTarget"
              type="number"
              dense
              outlined
              :min="1"
              :max="numPages"
              class="col"
              @keyup.enter="confirmMove"
            />
            <q-btn
              flat
              round
              dense
              icon="add"
              :disable="moveTarget >= numPages"
              @click="moveTarget++"
            />
          </div>

          <div class="text-caption text-grey-6 q-mt-sm">
            La page sera insérée avant la page {{ Math.min(moveTarget, numPages) }}.
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Annuler" v-close-popup />
          <q-btn
            color="primary"
            label="Déplacer"
            unelevated
            :disable="saving"
            :loading="saving"
            @click="confirmMove"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useQuasar } from "quasar";
import { api } from "boot/axios";

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const props = defineProps({
  src: { type: String, default: null },
  fileName: { type: String, default: "document.pdf" },
  dossierId: { type: [Number, String], default: null },
  canDelete: { type: Boolean, default: false },
  canMove: { type: Boolean, default: false },
});

const emit = defineEmits(["saved"]);

const $q = useQuasar();

const viewportEl = ref(null);
const canvasEl = ref(null);

const loading = ref(false);
const loadError = ref(false);

/* Stocké dans une variable PLAINE (pas un ref) : Vue envelopperait le document
 * pdf.js dans un Proxy réactif, ce qui casse les champs privés (#pagePromises).
 * Le document n'a pas besoin de réactivité — seuls numPages/pageNum sont réactifs. */
let pdfDoc = null;
const numPages = ref(0);
const pageNum = ref(1);

const scale = ref(1);
const fitMode = ref(true);
const rotation = ref(0);

let originalBytes = null;

const dirty = ref(false);
const saving = ref(false);

/** Opérations effectuées depuis le dernier enregistrement ("delete", "move") */
const performedActions = new Set();

const moveDialog = ref(false);
const moveTarget = ref(1);

const canEdit = computed(() => props.canMove || props.canDelete);

/* ============================================================
   RENDU
   ============================================================ */
let renderToken = 0;

async function renderPage() {
  if (!pdfDoc || !canvasEl.value || !viewportEl.value) return;

  const myToken = ++renderToken;
  const currentDoc = pdfDoc;

  const page = await currentDoc.getPage(pageNum.value);

  // Le document a été rechargé pendant le rendu → abandonner
  if (myToken !== renderToken || pdfDoc !== currentDoc) return;

  const baseViewport = page.getViewport({ scale: 1 });

  if (fitMode.value) {
    const avail = Math.max(viewportEl.value.clientWidth - 24, 100);
    scale.value = Math.max(0.2, avail / baseViewport.width);
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({
    scale: scale.value * dpr,
    rotation: rotation.value,
  });

  const canvas = canvasEl.value;
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  if (myToken !== renderToken || pdfDoc !== currentDoc) return;
}

async function loadDoc(bytes) {
  const oldDoc = pdfDoc;
  pdfDoc = null;
  renderToken++;

  if (oldDoc) {
    try {
      await oldDoc.destroy();
    } catch {
      /* ignore */
    }
  }

  // Donner une COPIE à pdf.js : il transfère (détache) le buffer passé,
  // ce qui rendrait inutilisable notre copie de travail pour pdf-lib.
  pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  numPages.value = pdfDoc.numPages;
  pageNum.value = Math.min(pageNum.value || 1, numPages.value);
  // Ne pas rendre ici : le canvas n'est monté qu'après loading=false.
}

async function loadFromSrc() {
  if (!props.src) return;
  loading.value = true;
  loadError.value = false;
  try {
    const response = await fetch(props.src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    originalBytes = new Uint8Array(buffer);
    await loadDoc(originalBytes);
    performedActions.clear();
  } catch (e) {
    console.error("Erreur chargement PDF :", e);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
  // Attendre le montage du <canvas> puis dessiner la 1re page.
  if (!loadError.value && pdfDoc) {
    await nextTick();
    await renderPage();
  }
}

watch(
  () => props.src,
  () => {
    dirty.value = false;
    loadFromSrc();
  },
  { immediate: true },
);

/* ============================================================
   NAVIGATION / ZOOM / ROTATION
   ============================================================ */
async function goPage(n) {
  if (n < 1 || n > numPages.value) return;
  pageNum.value = n;
  await renderPage();
}

async function zoom(factor) {
  fitMode.value = false;
  scale.value = Math.min(Math.max(scale.value * factor, 0.2), 5);
  await renderPage();
}

async function fitToPage() {
  fitMode.value = true;
  await renderPage();
}

async function rotate(deg) {
  rotation.value = (rotation.value + deg + 360) % 360;
  await renderPage();
}

/* ============================================================
   ÉDITION (pdf-lib)
   ============================================================ */
async function applyEdit(fn) {
  if (!originalBytes) return;

  // pdf-lib utilise aussi le buffer : lui donner une copie aussi
  const doc = await PDFDocument.load(new Uint8Array(originalBytes.slice()));
  await fn(doc);
  const out = await doc.save();

  originalBytes = new Uint8Array(out);
  dirty.value = true;

  await loadDoc(originalBytes);
  await nextTick();
  await renderPage();
}

function confirmDeletePage() {
  if (numPages.value < 2) {
    $q.notify({
      type: "warning",
      message: "Impossible de supprimer la seule page du document.",
    });
    return;
  }

  $q.dialog({
    title: "Supprimer une page",
    message: `Voulez-vous vraiment supprimer la page ${pageNum.value} ?`,
    cancel: { label: "Annuler", flat: true },
    ok: { label: "Supprimer", color: "negative", unelevated: true },
  }).onOk(async () => {
    const index = pageNum.value - 1;
    await applyEdit(async (doc) => {
      doc.removePage(index);
    });
    performedActions.add("delete");
    if (pageNum.value > numPages.value) {
      pageNum.value = numPages.value;
    }
    $q.notify({ type: "positive", message: "Page supprimée." });
  });
}

function openMoveDialog() {
  moveTarget.value = pageNum.value;
  moveDialog.value = true;
}

async function confirmMove() {
  let target = parseInt(moveTarget.value, 10);
  if (!target || Number.isNaN(target)) target = pageNum.value;

  const from = pageNum.value;
  const to = Math.min(Math.max(target, 1), numPages.value);

  moveDialog.value = false;

  if (to === from) {
    $q.notify({
      type: "warning",
      message: "La page est déjà à cette position.",
    });
    return;
  }

  saving.value = true;
  try {
    await applyEdit(async (doc) => {
      const [page] = await doc.copyPages(doc, [from - 1]);
      doc.removePage(from - 1);
      doc.insertPage(Math.min(to - 1, doc.getPageCount()), page);
    });
    performedActions.add("move");
    pageNum.value = to;
    $q.notify({ type: "positive", message: "Page déplacée." });
  } catch (e) {
    console.error("Erreur déplacement :", e);
    $q.notify({ type: "negative", message: "Erreur lors du déplacement." });
  } finally {
    saving.value = false;
  }
}

/* ============================================================
   ENREGISTREMENT
   ============================================================ */
async function save() {
  if (!dirty.value || !originalBytes) return;
  saving.value = true;
  try {
    const blob = new Blob([originalBytes], { type: "application/pdf" });
    const fd = new FormData();
    fd.append("fichier", blob, props.fileName || "document_modifie.pdf");
    fd.append(
      "action",
      performedActions.size ? [...performedActions].join(",") : "move",
    );

    await api.post(`/dossiers/${props.dossierId}/replace-file`, fd);

    $q.notify({
      type: "positive",
      message: "Le PDF modifié a été enregistré.",
    });

    dirty.value = false;
    performedActions.clear();
    emit("saved");
  } catch (e) {
    $q.notify({
      type: "negative",
      message:
        e.response?.data?.error || "Erreur lors de l'enregistrement du PDF.",
    });
  } finally {
    saving.value = false;
  }
}

/* ============================================================
   NETTOYAGE
   ============================================================ */
onUnmounted(() => {
  if (pdfDoc) {
    pdfDoc
      .destroy()
      .catch(() => {
        /* ignore */
      });
    pdfDoc = null;
  }
});
</script>

<style scoped>
.pdf-editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #525659;
  overflow: hidden;
}

.pdf-editor__toolbar {
  min-height: 44px;
  padding: 4px 8px;
  background: #323639;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
  overflow-x: auto;
  flex-shrink: 0;
}

.pdf-editor__toolbar :deep(.q-btn) {
  color: #e8eaed;
}

.pdf-editor__pageinfo,
.pdf-editor__zoom {
  font-size: 12px;
  color: #e8eaed;
  min-width: 42px;
  text-align: center;
  white-space: nowrap;
}

.pdf-editor__viewport {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12px;
  position: relative;
}

.pdf-editor__canvas {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  background: white;
}

.pdf-editor__state {
  margin: auto;
  text-align: center;
  color: #e8eaed;
}

.pdf-editor__dirty-badge {
  position: sticky;
  bottom: 8px;
  left: 50%;
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 12px;
  border-radius: 12px;
  pointer-events: none;
}
</style>