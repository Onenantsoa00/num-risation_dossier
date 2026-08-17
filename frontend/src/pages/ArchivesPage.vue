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

        <!-- ARCHIVAGE RAPIDE -->
        <q-btn
          v-if="isAdmin"
          color="deep-orange"
          icon="bolt"
          label="Archivage Rapide"
          unelevated
          @click="openQuickArchive"
        >
          <q-tooltip> Importer et archiver directement un dossier </q-tooltip>
        </q-btn>
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
        no-data-label="Aucune archive trouvée"
      >
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
              }"
            >
              <q-tooltip> Voir le dossier </q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- =========================================================
         DIALOG ARCHIVAGE RAPIDE
    ========================================================== -->
    <q-dialog v-model="quickDialog" maximized persistent>
      <div class="quick-archive-dialog">
        <DossierSplitLayout mode="fullscreen">
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
                  <q-input
                    v-model="quickForm.exo_budgetaire"
                    label="Exercice budgétaire *"
                    outlined
                    dense
                  />
                </div>

                <!-- N° BE -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.n_be"
                    label="N° BE *"
                    outlined
                    dense
                  />
                </div>

                <!-- N° ORD -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.n_ord"
                    label="N° ORD *"
                    outlined
                    dense
                  />
                </div>

                <!-- N° COMPTE -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.n_compte"
                    label="N° compte *"
                    outlined
                    dense
                  />
                </div>

                <!-- N° SOA -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.n_soa"
                    label="N° SOA *"
                    outlined
                    dense
                  />
                </div>

                <!-- COMPTE PC -->
                <div class="col-12 col-sm-6">
                  <q-input
                    v-model="quickForm.compte_pc"
                    label="Compte PC *"
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
                    label="Date fin du dossier *"
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
 * ARCHIVAGE RAPIDE
 * ============================================================
 */

const quickDialog = ref(false);
const quickLoading = ref(false);
const quickPreviewLoading = ref(false);
const quickError = ref("");

const quickFile = ref(null);

const quickFullscreen = ref(true);

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

/*
 * ============================================================
 * PERMISSION
 * ============================================================
 */

const isAdmin = computed(() => {
  return ["Admin", "super_admin"].includes(auth.role);
});

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
    label: "Compte PC",
    value: "compte_pc",
  },
  {
    label: "Référence d'écriture",
    value: "ref_ecriture",
  },
  {
    label: "Date fin du dossier",
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
    .map((value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, "_"),
    )
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

  if (!quickForm.compte_pc.trim()) {
    return "Le compte PC est obligatoire.";
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

onMounted(load);
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

.quick-archive-dialog {
  width: 100vw;
  height: 100vh;
  background: #111;
}

/*
 * La zone d'action est volontairement placée en bas
 * grâce au mode fullscreen de DossierSplitLayout.
 */
.quick-action-panel {
  width: 100%;
  background: white;
  padding: 18px 22px;
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
