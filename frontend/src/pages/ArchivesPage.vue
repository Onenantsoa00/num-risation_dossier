//frontend/src/pages/ArchivesPage.vue
<template>
  <q-page padding>
    <div class="page-shell">
      <!-- =========================================================
           EN-TÊTE
      ========================================================== -->
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Archives</h1>

          <p class="page-sub">Dossiers validés et archivés</p>
        </div>

        <div class="row q-gutter-sm items-center">
          <!-- TÉLÉCHARGEMENT DE LA SÉLECTION -->
          <q-btn
            v-if="selectedIds.length > 0"
            :color="selectedMissingCount > 0 ? 'warning' : 'positive'"
            :icon="selectedMissingCount > 0 ? 'link_off' : 'folder_zip'"
            :label="`Télécharger (${selectedIds.length})`"
            unelevated
            :loading="zipLoading"
            @click="downloadSelection"
          >
            <q-tooltip>
              <template v-if="selectedMissingCount > 0">
                {{ selectedMissingCount }} des {{ selectedIds.length }} dossiers
                sélectionnés n'ont plus leur fichier sur le serveur : le ZIP
                contiendra les autres.
              </template>

              <template v-else>
                Télécharger les fichiers des archives sélectionnées (ZIP)
              </template>
            </q-tooltip>
          </q-btn>

          <!-- ARCHIVAGE RAPIDE -->
          <q-btn
            v-if="canQuickArchive"
            color="deep-orange"
            icon="bolt"
            label="Archivage Rapide"
            unelevated
            @click="openQuickArchive"
          >
            <q-tooltip> Importer et archiver directement un dossier </q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- =========================================================
           RECHERCHE
      ========================================================== -->
      <div class="surface-card q-mb-md">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">
          Rechercher dans les archives
        </div>

        <div class="row q-col-gutter-md items-end">
          <!-- Recherche -->
          <div class="col-12 col-md-8">
            <q-input
              v-model="search"
              outlined
              dense
              clearable
              debounce="400"
              label="Rechercher"
              @update:model-value="load"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <!-- Type -->
          <div class="col-12 col-md-4">
            <q-select
              v-model="searchType"
              :options="searchTypeOptions"
              outlined
              dense
              emit-value
              map-options
              label="Type de recherche"
              @update:model-value="load"
            >
              <template #prepend>
                <q-icon name="filter_alt" />
              </template>
            </q-select>
          </div>
        </div>

        <div class="text-caption text-grey-6 q-mt-sm">
          <template v-if="searchType === 'tous'">
            La recherche porte sur tous les champs du dossier.
          </template>

          <template v-else>
            Recherche uniquement dans :
            <strong>
              {{ selectedSearchLabel }}
            </strong>
          </template>
        </div>
      </div>

      <!-- =========================================================
           TABLEAU
      ========================================================== -->
      <q-table
        flat
        bordered
        class="surface-card"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        :row-class="rowClass"
        selection="multiple"
        v-model:selected="selectedRows"
        no-data-label="Aucune archive trouvée"
      >
        <template #header-selection>
          <q-checkbox
            :model-value="allSelected"
            :indeterminate="someSelected && !allSelected"
            @update:model-value="toggleSelectAll"
          />
        </template>
        <!-- DOSSIER -->
        <template #body-cell-dossier_nom="props">
          <q-td :props="props">
            <div class="row items-center no-wrap">
              <div class="col min-width-0">
                <div
                  class="text-weight-medium ellipsis"
                  :title="props.row.dossier_nom"
                >
                  {{ props.row.dossier_nom || "—" }}
                </div>

                <q-badge
                  v-if="props.row.archivage_rapide"
                  color="deep-orange"
                  text-color="white"
                  icon="bolt"
                  class="q-mt-xs"
                >
                  Archivage rapide
                </q-badge>

                <q-badge
                  v-if="props.row.fichier_disponible === false"
                  color="negative"
                  text-color="white"
                  icon="link_off"
                  class="q-mt-xs q-ml-xs"
                >
                  Fichier introuvable
                </q-badge>
              </div>
            </div>
          </q-td>
        </template>

        <!-- AGENT -->
        <template #body-cell-archiveur="props">
          <q-td :props="props">
            <div>
              {{
                props.row.archiveur_prenoms
                  ? `${props.row.archiveur_prenoms} ${props.row.archiveur_nom}`
                  : "—"
              }}
            </div>

            <div class="text-caption text-grey-6">
              IM :
              {{ props.row.archiveur_im || "—" }}
            </div>
          </q-td>
        </template>

        <!-- DATE FIN -->
        <template #body-cell-date_fin_dossier="props">
          <q-td :props="props">
            {{ formatDateOnly(props.row.date_fin_dossier) }}
          </q-td>
        </template>

        <!-- DATE ARCHIVAGE -->
        <template #body-cell-date_archivage="props">
          <q-td :props="props">
            {{ formatDateTime(props.row.date_archivage) }}
          </q-td>
        </template>

        <!-- ACTION -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              :to="{
                name: 'dossier-detail',
                params: {
                  id: props.row.id_dossier,
                },
                query: {
                  from: 'archives',
                },
              }"
            >
              <q-tooltip> Voir le dossier </q-tooltip>
            </q-btn>

            <q-btn
              flat
              dense
              round
              icon="download"
              :color="
                props.row.fichier_disponible === false ? 'grey-6' : 'positive'
              "
              @click.stop="downloadSelection([props.row])"
            >
              <q-tooltip>
                {{
                  props.row.fichier_disponible === false
                    ? "Fichier introuvable sur le serveur"
                    : "Télécharger ce fichier"
                }}
              </q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- =========================================================
         DIALOG ARCHIVAGE RAPIDE
    ========================================================== -->
    <q-dialog v-model="quickDialog" persistent>
      <div class="quick-archive-dialog">
        <DossierSplitLayout :mode="quickFullscreen ? 'fullscreen' : 'preview'">
          <!-- =====================================================
               PARTIE GAUCHE : APERÇU
          ====================================================== -->
          <template #left>
            <DossierFilePreview
              :file="quickFile"
              :loading="quickPreviewLoading"
              @fullscreen="onQuickFullscreen"
            />
          </template>

          <!-- =====================================================
               PARTIE DROITE / BAS : FORMULAIRE
          ====================================================== -->
          <template #right>
            <div class="quick-action-panel">
              <!-- HEADER -->
              <div class="row items-center justify-between q-mb-md">
                <div>
                  <div class="text-h6 text-weight-bold">Archivage Rapide</div>

                  <div class="text-caption text-grey-7">
                    Importez et archivez directement le dossier
                  </div>
                </div>

                <q-btn
                  flat
                  round
                  dense
                  icon="close"
                  @click="closeQuickArchive"
                />
              </div>

              <q-separator class="q-mb-md" />

              <!-- NOM AUTOMATIQUE -->
              <q-input
                :model-value="quickNomDossier"
                label="Nom du dossier"
                outlined
                readonly
                class="q-mb-md"
              >
                <template #prepend>
                  <q-icon name="folder" />
                </template>
              </q-input>

              <!-- =================================================
                   FICHIER
              ================================================== -->
              <q-file
                v-model="quickFile"
                label="Sélectionner le fichier *"
                outlined
                clearable
                accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.xls,.xlsx,.txt"
                class="q-mb-md"
              >
                <template #prepend>
                  <q-icon name="attach_file" />
                </template>

                <template #hint> Sélectionnez le document à archiver </template>
              </q-file>

              <!-- =================================================
                   INFORMATIONS
              ================================================== -->
              <div class="text-subtitle2 text-weight-bold q-mb-sm">
                Informations du dossier
              </div>

              <div class="row q-col-gutter-md">
                <!-- EXERCICE -->
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="quickForm.exo_budgetaire"
                    label="Exercice budgétaire *"
                    outlined
                    dense
                    use-input
                    fill-input
                    hide-selected
                    input-debounce="200"
                    :options="quickSuggestions.exo_budgetaire"
                    maxlength="4"
                    @filter="
                      (val, update) =>
                        filterQuickField('exo_budgetaire', val, update)
                    "
                    @input-value="
                      (value) => onQuickFieldTyped('exo_budgetaire', value)
                    "
                  >
                    <template #hint>
                      {{ quickForm.exo_budgetaire.length }}/4 caractères
                    </template>
                  </q-select>
                </div>

                <!-- N° BE -->
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="quickForm.n_be"
                    label="N° BE *"
                    outlined
                    dense
                    use-input
                    fill-input
                    hide-selected
                    input-debounce="200"
                    :options="quickSuggestions.n_be"
                    maxlength="6"
                    @filter="
                      (val, update) => filterQuickField('n_be', val, update)
                    "
                    @input-value="(value) => onQuickFieldTyped('n_be', value)"
                  >
                    <template #hint>
                      {{ quickForm.n_be.length }}/6 caractères
                    </template>
                  </q-select>
                </div>

                <!-- N° ORD -->
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="quickForm.n_ord"
                    label="N° ORD *"
                    outlined
                    dense
                    use-input
                    fill-input
                    hide-selected
                    input-debounce="200"
                    :options="quickSuggestions.n_ord"
                    maxlength="6"
                    @filter="
                      (val, update) => filterQuickField('n_ord', val, update)
                    "
                    @input-value="(value) => onQuickFieldTyped('n_ord', value)"
                  >
                    <template #hint>
                      {{ quickForm.n_ord.length }}/6 caractères
                    </template>
                  </q-select>
                </div>

                <!-- N° COMPTE -->
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="quickForm.n_compte"
                    label="N° compte *"
                    outlined
                    dense
                    use-input
                    fill-input
                    hide-selected
                    input-debounce="200"
                    :options="quickSuggestions.n_compte"
                    maxlength="4"
                    @filter="
                      (val, update) => filterQuickField('n_compte', val, update)
                    "
                    @input-value="
                      (value) => onQuickFieldTyped('n_compte', value)
                    "
                  >
                    <template #hint>
                      {{ quickForm.n_compte.length }}/4 caractères
                    </template>
                  </q-select>
                </div>

                <!-- N° SOA -->
                <div class="col-12 col-sm-6">
                  <q-select
                    v-model="quickForm.n_soa"
                    label="N° SOA *"
                    outlined
                    dense
                    use-input
                    fill-input
                    hide-selected
                    input-debounce="200"
                    :options="quickSuggestions.n_soa"
                    maxlength="18"
                    hint="Format: XX-XX-X-XXX-XXXXX"
                    @filter="
                      (val, update) => filterQuickField('n_soa', val, update)
                    "
                    @input-value="onQuickSoaTyped"
                  />
                </div>

                <!-- COMPTE PC -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.compte_pc"
                    label="Compte Prise en charge *"
                    outlined
                    dense
                    maxlength="15"
                  />
                </div>

                <!-- REF ECRITURE -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.ref_ecriture"
                    label="Réf. écriture *"
                    outlined
                    dense
                    maxlength="15"
                  />
                </div>

                <!-- DATE FIN -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.date_fin_dossier"
                    label="Date d'écriture *"
                    type="date"
                    outlined
                    dense
                    stack-label
                  />
                </div>
              </div>

              <!-- INFO IM -->
              <q-banner class="bg-orange-1 text-orange-10 q-mt-md" rounded>
                <template #avatar>
                  <q-icon name="badge" />
                </template>

                L'IM utilisé sera automatiquement celui de votre compte :
                <strong>
                  {{ auth.user?.im || "Non renseigné" }}
                </strong>
              </q-banner>

              <!-- ERREUR -->
              <q-banner
                v-if="quickError"
                class="bg-red-1 text-negative q-mt-md"
                rounded
              >
                <template #avatar>
                  <q-icon name="error" />
                </template>

                {{ quickError }}
              </q-banner>

              <!-- ACTION -->
              <div class="quick-action-buttons q-mt-md">
                <q-btn flat label="Annuler" @click="closeQuickArchive" />

                <q-btn
                  color="deep-orange"
                  icon="bolt"
                  label="Archiver directement"
                  unelevated
                  :loading="quickLoading"
                  :disable="!quickFile"
                  @click="quickArchive"
                />
              </div>
            </div>
          </template>
        </DossierSplitLayout>
      </div>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";

import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";

import DossierFilePreview from "components/DossierFilePreview.vue";
import DossierSplitLayout from "components/DossierSplitLayout.vue";

const $q = useQuasar();
const auth = useAuthStore();

/*
 * ============================================================
 * ARCHIVES
 * ============================================================
 */

const rows = ref([]);
const loading = ref(false);

const search = ref("");
const searchType = ref("tous");

/*
 * ============================================================
 * SÉLECTION MULTIPLE / TÉLÉCHARGEMENT
 * ============================================================
 */

const selectedRows = ref([]);
const zipLoading = ref(false);

const selectedIds = computed(() =>
  selectedRows.value.map((row) => row.id_dossier).filter(Boolean),
);

const allSelected = computed(
  () =>
    rows.value.length > 0 && selectedRows.value.length === rows.value.length,
);

const someSelected = computed(() => selectedRows.value.length > 0);

/*
 * Parmi les lignes cochées, celles dont le fichier a disparu du
 * serveur : elles ne pourront pas figurer dans le ZIP.
 */
const selectedMissingCount = computed(
  () =>
    selectedRows.value.filter((row) => row.fichier_disponible === false).length,
);

function toggleSelectAll(checked) {
  selectedRows.value = checked ? [...rows.value] : [];
}

/*
 * ============================================================
 * RAPPORT DU TÉLÉCHARGEMENT ZIP
 * ============================================================
 * Le serveur renvoie combien de fichiers ont été inclus dans le ZIP
 * et le nom des dossiers dont le fichier est introuvable sur le
 * disque : ces derniers ne peuvent pas être téléchargés et doivent
 * donc être signalés à l'utilisateur.
 */
function readZipReport(response, totalSelection) {
  const headers = response.headers || {};

  const total = Number(headers["x-archives-total"]) || totalSelection;
  const missing = Number(headers["x-archives-missing"]) || 0;

  const included =
    headers["x-archives-included"] === undefined
      ? total - missing
      : Number(headers["x-archives-included"]);

  let missingNames = [];

  const rawNames = headers["x-archives-missing-names"];

  if (rawNames) {
    try {
      missingNames = decodeURIComponent(rawNames)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    } catch {
      missingNames = [];
    }
  }

  return { total, included, missing, missingNames };
}

function notifyZipReport(report) {
  if (report.missing > 0) {
    const apercu = report.missingNames.slice(0, 3).join(", ");
    const reste =
      report.missingNames.length > 3
        ? ` (+${report.missingNames.length - 3} autre(s))`
        : "";

    $q.notify({
      type: "warning",
      icon: "link_off",
      timeout: 15000,
      message:
        `${report.included} fichier(s) téléchargé(s) sur ${report.total}. ` +
        `Fichier introuvable sur le serveur pour : ${apercu}${reste}`,
      caption: "Ces dossiers ne peuvent pas être téléchargés.",
    });

    return;
  }

  $q.notify({
    type: "positive",
    icon: "folder_zip",
    message: `${report.included} fichier(s) téléchargé(s).`,
  });
}

/*
 * Télécharge en ZIP le fichier des archives sélectionnées
 * (une seule ligne depuis le bouton de la ligne, ou toute la
 * sélection depuis le bouton d'en-tête).
 */
async function downloadSelection(selection) {
  const source = Array.isArray(selection) ? selection : selectedRows.value;

  const ids = source.map((row) => row.id_dossier).filter(Boolean);

  if (!ids.length) return;

  zipLoading.value = true;

  try {
    const response = await api.post(
      "/archives/download-zip",
      { dossier_ids: ids },
      { responseType: "blob" },
    );

    // Nom du fichier fourni par le serveur
    let filename = `archives_selection_${new Date()
      .toISOString()
      .slice(0, 10)}.zip`;

    const cd = response.headers?.["content-disposition"];
    const match = cd && cd.match(/filename="?([^";]+)"?/);

    if (match) {
      try {
        filename = decodeURIComponent(match[1]);
      } catch {
        filename = match[1];
      }
    }

    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    notifyZipReport(readZipReport(response, ids.length));

    selectedRows.value = [];
  } catch (error) {
    console.error("Erreur téléchargement archives :", error);

    let message =
      error.response?.data?.error || "Impossible de télécharger la sélection.";

    if (error.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await error.response.data.text());
        message = parsed.error || message;
      } catch {
        // Réponse illisible : on garde le message par défaut.
      }
    }

    $q.notify({ type: "negative", message });
  } finally {
    zipLoading.value = false;
  }
}

/*
 * ============================================================
 * ARCHIVAGE RAPIDE
 * ============================================================
 */

const quickDialog = ref(false);
const quickLoading = ref(false);
const quickPreviewLoading = ref(false);
const quickError = ref("");

const quickFile = ref(null);

const quickFullscreen = ref(false);

const quickForm = reactive({
  exo_budgetaire: "",
  n_be: "",
  n_ord: "",
  n_compte: "",
  n_soa: "",
  compte_pc: "",
  ref_ecriture: "",
  date_fin_dossier: "",
});

const QUICK_FIELD_LIMITS = {
  n_compte: 4,
  n_be: 6,
  n_soa: 18,
  n_ord: 6,
  exo_budgetaire: 4,
};

const QUICK_AUTOCOMPLETE_FIELDS = Object.keys(QUICK_FIELD_LIMITS);

const quickSuggestions = reactive({
  n_compte: [],
  n_be: [],
  n_soa: [],
  n_ord: [],
  exo_budgetaire: [],
});

const quickApiHistory = reactive({
  n_compte: [],
  n_be: [],
  n_soa: [],
  n_ord: [],
  exo_budgetaire: [],
});

/*
 * ============================================================
 * PERMISSION
 * ============================================================
 */

const canQuickArchive = computed(() => {
  return ["i_archive", "Admin", "super_admin"].includes(auth.role);
});

function sanitizeQuickField(value, maxLength) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);
}

function formatQuickSoa(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 13);
  const parts = [];
  if (raw.length > 0) parts.push(raw.slice(0, 2));
  if (raw.length > 2) parts.push(raw.slice(2, 4));
  if (raw.length > 4) parts.push(raw.slice(4, 5));
  if (raw.length > 5) parts.push(raw.slice(5, 8));
  if (raw.length > 8) parts.push(raw.slice(8, 13));
  return parts.join("-");
}

function onQuickFieldTyped(field, value) {
  quickForm[field] = sanitizeQuickField(value, QUICK_FIELD_LIMITS[field]);
}

function onQuickSoaTyped(value) {
  quickForm.n_soa = formatQuickSoa(value);
}

function getQuickAutocompleteHistory() {
  try {
    const raw = localStorage.getItem("dossier_autocomplete");
    const history = raw ? JSON.parse(raw) : [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function quickLocalHistoryFor(field) {
  const seen = new Set();
  return getQuickAutocompleteHistory()
    .map((entry) => String(entry?.[field] || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function mergeQuickSuggestions(field, needle = "") {
  const seen = new Set();
  const query = String(needle || "")
    .trim()
    .toUpperCase();
  return [...quickLocalHistoryFor(field), ...(quickApiHistory[field] || [])]
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return !query || value.toUpperCase().includes(query);
    })
    .slice(0, 20);
}

async function preloadQuickSuggestions() {
  await Promise.all(
    QUICK_AUTOCOMPLETE_FIELDS.map(async (field) => {
      try {
        const { data } = await api.get("/dossiers/autocomplete", {
          params: { field },
        });
        quickApiHistory[field] = Array.isArray(data) ? data : [];
      } catch {
        quickApiHistory[field] = [];
      }
      quickSuggestions[field] = mergeQuickSuggestions(field);
    }),
  );
}

function filterQuickField(field, value, update) {
  update(() => {
    quickSuggestions[field] = mergeQuickSuggestions(field, value);
  });
}

function saveQuickAutocomplete() {
  const history = getQuickAutocompleteHistory();
  history.unshift({
    ...Object.fromEntries(
      QUICK_AUTOCOMPLETE_FIELDS.map((field) => [field, quickForm[field]]),
    ),
    timestamp: Date.now(),
  });
  if (history.length > 50) history.length = 50;
  try {
    localStorage.setItem("dossier_autocomplete", JSON.stringify(history));
  } catch {
    // L'archivage est déjà effectué côté serveur.
  }
}

/*
 * ============================================================
 * RECHERCHE
 * ============================================================
 */

const searchTypeOptions = [
  {
    label: "Tous les champs",
    value: "tous",
  },
  {
    label: "Nom du dossier",
    value: "nom",
  },
  {
    label: "Exercice budgétaire",
    value: "exo_budgetaire",
  },
  {
    label: "N° BE",
    value: "n_be",
  },
  {
    label: "N° ORD",
    value: "n_ord",
  },
  {
    label: "N° compte",
    value: "n_compte",
  },
  {
    label: "N° SOA",
    value: "n_soa",
  },
  {
    label: "Compte Prise en charge",
    value: "compte_pc",
  },
  {
    label: "Référence d'écriture",
    value: "ref_ecriture",
  },
  {
    label: "Date d'écriture",
    value: "date_fin_dossier",
  },
  {
    label: "IM de l'archiveur",
    value: "im",
  },
];

const selectedSearchLabel = computed(() => {
  return (
    searchTypeOptions.find((option) => option.value === searchType.value)
      ?.label || "Tous les champs"
  );
});

/*
 * ============================================================
 * COLONNES
 * ============================================================
 */

const columns = [
  {
    name: "id",
    label: "#",
    field: "id",
    align: "left",
  },

  {
    name: "dossier_nom",
    label: "Dossier",
    field: "dossier_nom",
    align: "left",
    sortable: true,
  },

  {
    name: "archiveur",
    label: "Agent",
    field: (row) =>
      row.archiveur_nom ? `${row.archiveur_prenoms} ${row.archiveur_nom}` : "—",
    align: "left",
  },

  {
    name: "date_fin_dossier",
    label: "Date fin",
    field: "date_fin_dossier",
    align: "left",
    sortable: true,
  },

  {
    name: "date_archivage",
    label: "Date archivage",
    field: "date_archivage",
    align: "left",
    sortable: true,
  },

  {
    name: "actions",
    label: "",
    field: "actions",
    align: "right",
  },
];

/*
 * ============================================================
 * COULEUR DES LIGNES
 * ============================================================
 */

function rowClass(row) {
  if (row.archivage_rapide) {
    return "archive-quick-row";
  }

  return "";
}

/*
 * ============================================================
 * DATES
 * ============================================================
 */

function formatDateOnly(value) {
  if (!value) {
    return "—";
  }

  const text = String(value).slice(0, 10);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) {
    return "—";
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("fr-FR");
}

/*
 * ============================================================
 * CHARGER LES ARCHIVES
 * ============================================================
 */

async function load() {
  loading.value = true;

  try {
    const params = {};

    if (search.value.trim()) {
      params.q = search.value.trim();
    }

    params.type = searchType.value;

    const { data } = await api.get("/archives", { params });

    rows.value = data;

    // Les lignes ont changé : la sélection précédente n'est plus valable.
    selectedRows.value = [];
  } catch (error) {
    console.error("Erreur chargement archives :", error);

    $q.notify({
      type: "negative",
      message:
        error.response?.data?.error || "Impossible de charger les archives.",
    });
  } finally {
    loading.value = false;
  }
}

/*
 * ============================================================
 * NOM AUTOMATIQUE
 * ============================================================
 */

/*
 * Même sécurisation que le serveur (safePart) : les tirets du N° SOA
 * deviennent des « _ ». Sans cela, le nom affiché ici différait du nom
 * réellement enregistré.
 */
function safeNamePart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const quickNomDossier = computed(() => {
  const dateCompacte = quickForm.date_fin_dossier
    ? quickForm.date_fin_dossier.replace(/-/g, "")
    : "";

  const im = auth.user?.im || "";

  return [
    quickForm.exo_budgetaire,
    quickForm.n_be,
    quickForm.n_ord,
    quickForm.n_compte,
    quickForm.n_soa,
    quickForm.compte_pc,
    quickForm.ref_ecriture,
    dateCompacte,
    im,
  ]
    .map(safeNamePart)
    .filter(Boolean)
    .join("_");
});

/*
 * ============================================================
 * OUVRIR ARCHIVAGE RAPIDE
 * ============================================================
 */

function openQuickArchive() {
  resetQuickArchive();

  quickDialog.value = true;
}

/*
 * ============================================================
 * FERMER
 * ============================================================
 */

function closeQuickArchive() {
  if (quickLoading.value) {
    return;
  }

  quickDialog.value = false;

  resetQuickArchive();
}

/*
 * ============================================================
 * RESET
 * ============================================================
 */

function resetQuickArchive() {
  quickFile.value = null;
  quickError.value = "";
  quickFullscreen.value = false;

  Object.assign(quickForm, {
    exo_budgetaire: "",
    n_be: "",
    n_ord: "",
    n_compte: "",
    n_soa: "",
    compte_pc: "",
    ref_ecriture: "",
    date_fin_dossier: "",
  });
}

/*
 * ============================================================
 * FULLSCREEN
 * ============================================================
 */

function onQuickFullscreen(value) {
  quickFullscreen.value = value;
}

/*
 * ============================================================
 * VALIDATION
 * ============================================================
 */

function validateQuickArchive() {
  if (!quickFile.value) {
    return "Veuillez sélectionner un fichier.";
  }

  if (!quickForm.exo_budgetaire.trim()) {
    return "L'exercice budgétaire est obligatoire.";
  }

  if (!quickForm.n_be.trim()) {
    return "Le N° BE est obligatoire.";
  }

  if (!quickForm.n_ord.trim()) {
    return "Le N° ORD est obligatoire.";
  }

  if (!quickForm.n_compte.trim()) {
    return "Le N° compte est obligatoire.";
  }

  if (!quickForm.n_soa.trim()) {
    return "Le N° SOA est obligatoire.";
  }

  if (quickForm.exo_budgetaire.length !== 4) {
    return "L'exercice budgétaire doit contenir exactement 4 caractères.";
  }

  if (quickForm.n_be.length !== 6) {
    return "Le N° BE doit contenir exactement 6 caractères.";
  }

  if (quickForm.n_ord.length !== 6) {
    return "Le N° ORD doit contenir exactement 6 caractères.";
  }

  if (quickForm.n_compte.length !== 4) {
    return "Le N° compte doit contenir exactement 4 caractères.";
  }

  if (quickForm.n_soa.replace(/-/g, "").length !== 13) {
    return "Le N° SOA doit contenir exactement 13 caractères (XX-XX-X-XXX-XXXXX).";
  }

  if (!quickForm.compte_pc.trim()) {
    return "Le compte Prise en charge est obligatoire.";
  }

  if (!quickForm.ref_ecriture.trim()) {
    return "La référence d'écriture est obligatoire.";
  }

  if (!quickForm.date_fin_dossier) {
    return "La date de fin du dossier est obligatoire.";
  }

  return "";
}

/*
 * ============================================================
 * ARCHIVAGE RAPIDE
 * ============================================================
 */

async function quickArchive() {
  quickError.value = "";

  const validation = validateQuickArchive();

  if (validation) {
    quickError.value = validation;
    return;
  }

  quickLoading.value = true;
  quickPreviewLoading.value = true;

  try {
    const fd = new FormData();

    fd.append("exo_budgetaire", quickForm.exo_budgetaire.trim());

    fd.append("n_be", quickForm.n_be.trim());

    fd.append("n_ord", quickForm.n_ord.trim());

    fd.append("n_compte", quickForm.n_compte.trim());

    fd.append("n_soa", quickForm.n_soa.trim());

    fd.append("compte_pc", quickForm.compte_pc.trim());

    fd.append("ref_ecriture", quickForm.ref_ecriture.trim());

    fd.append("date_fin_dossier", quickForm.date_fin_dossier);

    fd.append("fichier", quickFile.value);

    await api.post("/archives/quick", fd, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    saveQuickAutocomplete();

    $q.notify({
      type: "positive",
      icon: "bolt",
      message: "Dossier importé et archivé directement.",
    });

    quickDialog.value = false;

    resetQuickArchive();

    await load();
  } catch (error) {
    console.error("Erreur archivage rapide :", error);

    quickError.value =
      error.response?.data?.error || "Erreur lors de l'archivage rapide.";
  } finally {
    quickLoading.value = false;
    quickPreviewLoading.value = false;
  }
}

onMounted(() => {
  load();
  preloadQuickSuggestions();
});
</script>

<style scoped>
/* =========================================================
   LIGNE ARCHIVAGE RAPIDE
========================================================= */

:deep(.archive-quick-row) {
  background: #fff7ed !important;
}

:deep(.archive-quick-row td) {
  background: #fff7ed !important;
}

/* =========================================================
   DIALOG ARCHIVAGE RAPIDE
========================================================= */

/*
 * Fenêtre NORMALE (même esprit que la page d'import du
 * Dispatch) : aperçu à gauche, formulaire à droite.
 * Le mode plein écran reste disponible via le bouton
 * "Plein écran" de l'aperçu.
 */
.quick-archive-dialog {
  width: min(1800px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  max-height: 92vh;
  overflow-y: auto;
  border-radius: 12px;
  background: #f5f7fa;
  padding: 18px 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

@media (min-width: 1001px) {
  .quick-archive-dialog :deep(.dossier-workspace--preview) {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 380px);
  }
}

/*
 * La zone d'action est un panneau normal (le mode
 * plein écran de DossierSplitLayout la place en bas
 * lorsque l'utilisateur l'active).
 */
.quick-action-panel {
  width: 100%;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 18px 22px;
}

/*
 * Aperçu : hauteur adaptée à la fenêtre (et non 100vh).
 */
.quick-archive-dialog
  :deep(.dossier-workspace--preview .dossier-workspace__left) {
  min-height: 0;
}

.quick-archive-dialog
  :deep(.dossier-workspace--preview .dossier-workspace__left .file-preview) {
  height: 62vh;
  min-height: 420px;
}

.quick-archive-dialog
  :deep(.dossier-workspace--preview .dossier-workspace__right) {
  position: static;
  max-height: none;
  overflow: visible;
}

/* =========================================================
   BOUTONS
========================================================= */

.quick-action-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

/* =========================================================
   MOBILE
========================================================= */

@media (max-width: 600px) {
  .quick-action-panel {
    padding: 14px;
  }

  .quick-action-buttons {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .quick-action-buttons .q-btn {
    width: 100%;
  }
}
</style>
