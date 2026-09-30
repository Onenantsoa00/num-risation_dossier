<template>
  <q-page padding>
    <div class="page-shell">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Dossiers</h1>
          <p class="page-sub">Suivi et validation des dossiers ORDSEC</p>
        </div>
        <div class="row q-gutter-sm items-center">
          <q-btn
            v-if="
              selectedIds.length > 0 &&
              ['Admin', 'super_admin'].includes(auth.role)
            "
            color="primary"
            icon="person_add"
            :label="`Assigner (${selectedIds.length})`"
            unelevated
            @click="showBatchAssignDialog = true"
          />
          <q-btn
            v-if="canExportZip && selectedIds.length > 0"
            color="positive"
            icon="folder_zip"
            :label="`Exporter ZIP (${selectedIds.length})`"
            unelevated
            :loading="zipLoading"
            @click="exportZip"
          />
          <q-btn
            v-if="['Dispatch', 'Admin'].includes(auth.role)"
            color="primary"
            icon="upload_file"
            label="Importer"
            :to="{ name: 'dossier-create' }"
            unelevated
          />
        </div>
      </div>

      <div class="surface-card q-mb-md">
        <div class="row q-col-gutter-md items-end">
          <div class="col-12 col-md-5">
            <q-input
              v-model="filters.q"
              dense
              outlined
              clearable
              label="Rechercher"
              debounce="300"
              @update:model-value="load"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-12 col-md-4">
            <q-select
              v-model="filters.statut"
              :options="statutOptions"
              dense
              outlined
              clearable
              emit-value
              map-options
              label="Statut"
              @update:model-value="load"
            />
          </div>
          <div class="col-12 col-md-3">
            <q-btn
              outline
              color="primary"
              label="Actualiser"
              class="full-width"
              icon="refresh"
              @click="load"
            />
          </div>
        </div>
      </div>

      <q-table
        flat
        bordered
        class="surface-card"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
        :selection="canSelectRows ? 'multiple' : 'none'"
        v-model:selected="selectedRows"
        @update:selected="onSelectedUpdate"
        @row-click="
          (_, row) =>
            $router.push({ name: 'dossier-detail', params: { id: row.id } })
        "
        @row-contextmenu="onRowContextMenu"
      >
        <template #header-selection>
          <q-checkbox
            :model-value="allSelectableSelected"
            :indeterminate="someSelectableSelected && !allSelectableSelected"
            @update:model-value="toggleSelectAllSelectable"
          />
        </template>
        <template #body-selection="scope">
          <q-checkbox
            v-if="isRowSelectable(scope.row)"
            :model-value="scope.selected"
            @update:model-value="scope.selected = $event"
            @click.stop
          />
        </template>
        <template #body-cell-nom="props">
          <q-td :props="props">
            <a
              class="dossier-link"
              :href="
                router.resolve({
                  name: 'dossier-detail',
                  params: { id: props.row.id },
                }).href
              "
              @click.prevent.stop="openInCurrentTab(props.row)"
            >
              {{ props.row.nom }}
            </a>
          </q-td>
        </template>
        <template #body-cell-statut="props">
          <q-td :props="props">
            <q-badge :color="statusColor(props.row.statut)" class="status-chip">
              {{ statusLabel(props.row.statut) }}
            </q-badge>
          </q-td>
        </template>
        <template #body-cell-deadline_at="props">
          <q-td :props="props">
            <div
              class="row items-center no-wrap"
              :class="deadlineColorClass(props.row.deadline_color)"
            >
              <span
                class="deadline-dot"
                :style="{
                  background: deadlineDotColor(props.row.deadline_color),
                }"
              ></span>
              <span class="text-weight-medium">{{
                formatDeadlineAt(props.row.deadline_at)
              }}</span>
            </div>
          </q-td>
        </template>
        <template #body-cell-deadline="props">
          <q-td :props="props">
            <span
              class="text-weight-medium"
              :class="deadlineColorClass(props.row.deadline_color)"
            >
              {{ props.row.deadline_remaining_label || "—" }}
            </span>
          </q-td>
        </template>
        <template #body-cell-acteurs="props">
          <q-td :props="props">
            <div class="text-body2">
              <div>
                <span class="text-grey-7">Dispatch:</span>
                {{
                  props.row.dispatch_prenoms
                    ? props.row.dispatch_prenoms + " " + props.row.dispatch_nom
                    : "—"
                }}
              </div>
              <div>
                <span class="text-grey-7">Vérificateur:</span>
                {{
                  props.row.verificateur_prenoms
                    ? props.row.verificateur_prenoms +
                      " " +
                      props.row.verificateur_nom
                    : "—"
                }}
              </div>
              <div>
                <span class="text-grey-7">Validateur:</span>
                {{
                  props.row.validateur_prenoms
                    ? props.row.validateur_prenoms +
                      " " +
                      props.row.validateur_nom
                    : "—"
                }}
              </div>
            </div>
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              :to="{ name: 'dossier-detail', params: { id: props.row.id } }"
            >
              <q-tooltip>Voir le dossier</q-tooltip>
            </q-btn>
            <q-btn
              v-if="
                ['Admin', 'super_admin'].includes(auth.role) &&
                props.row.statut === 'REJETE'
              "
              flat
              dense
              round
              icon="delete"
              color="negative"
              :loading="deletingId === props.row.id"
              @click.stop="confirmDelete(props.row)"
            >
              <q-tooltip>Supprimer ce dossier rejeté</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>

      <!-- Context Menu (clic droit) — ancre fixe + q-menu (évite l'erreur Quasar target) -->
      <div
        v-if="contextMenuAnchor"
        class="context-menu-anchor"
        :style="{
          position: 'fixed',
          left: contextMenuAnchor.x + 'px',
          top: contextMenuAnchor.y + 'px',
          width: '1px',
          height: '1px',
          zIndex: 6000,
        }"
      >
        <q-menu
          v-model="showContextMenu"
          :target="true"
          no-parent-event
          @hide="contextMenuAnchor = null"
        >
          <q-list style="min-width: 200px" dense>
            <q-item
              v-if="contextMenuRow"
              clickable
              v-close-popup
              @click="openInCurrentTab(contextMenuRow)"
            >
              <q-item-section avatar
                ><q-icon name="visibility"
              /></q-item-section>
              <q-item-section>Ouvrir le dossier</q-item-section>
            </q-item>
            <q-item
              v-if="
                ['Admin', 'super_admin'].includes(auth.role) &&
                contextMenuRow?.statut === 'REJETE'
              "
              clickable
              v-close-popup
              @click="confirmDelete(contextMenuRow)"
            >
              <q-item-section avatar
                ><q-icon name="delete" color="negative"
              /></q-item-section>
              <q-item-section class="text-negative">Supprimer</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </div>

      <!-- Batch Assign Dialog -->
      <q-dialog v-model="showBatchAssignDialog" persistent>
        <q-card style="width: 480px; max-width: 95vw">
          <q-card-section>
            <div class="text-h6">Assigner un vérificateur</div>
            <p class="text-caption text-grey-7 q-mt-xs">
              {{ selectedIds.length }} dossier(s) sélectionné(s) seront assignés
            </p>
          </q-card-section>
          <q-card-section class="q-pt-none">
            <q-select
              v-model="batchVerificateurId"
              :options="filteredVerificateurs"
              label="Vérificateur *"
              outlined
              dense
              emit-value
              map-options
              use-input
              input-debounce="200"
              @filter="filterVerificateurs"
              @popup-show="resetVerificateurFilter"
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps" :disable="scope.opt.en_conge">
                  <q-item-section>
                    <q-item-label
                      :class="{ 'text-grey-5': scope.opt.en_conge }"
                    >
                      {{ scope.opt.label }}
                      <q-badge
                        v-if="scope.opt.en_conge"
                        color="negative"
                        class="q-ml-xs"
                        label="En congé"
                      />
                    </q-item-label>
                    <q-item-label caption>
                      IM : {{ scope.opt.im || "—" }} —
                      {{ scope.opt.nb_dossiers || 0 }} dossier(s)
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Annuler" v-close-popup />
            <q-btn
              color="primary"
              label="Assigner"
              unelevated
              :loading="batchLoading"
              :disable="!batchVerificateurId"
              @click="batchAssign"
            />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";
import { statusColor, statusLabel, statutOptions } from "src/utils/status";

const auth = useAuthStore();
const router = useRouter();
const $q = useQuasar();
const rows = ref([]);
const loading = ref(false);
const filters = ref({ q: "", statut: null });
const deletingId = ref(null);

const canBatchAssign = computed(() =>
  ["Admin", "super_admin"].includes(auth.role),
);

// ============================================================
// Multi-select par rôle :
//  - Admin / super_admin : assignation (EN_ATTENTE_VERIFICATEUR)
//  - Dispatch : export ZIP (VALIDÉ, RETOUR DISPATCH, REJETÉ)
// ============================================================
const ZIP_STATUSES = ["VALIDE", "RETOUR_DISPATCH", "REJETE"];
const canExportZip = computed(() => auth.role === "Dispatch");
const canSelectRows = computed(
  () => canBatchAssign.value || canExportZip.value,
);

const selectedRows = ref([]);
const selectedIds = computed(() => selectedRows.value.map((r) => r.id));
const zipLoading = ref(false);

function isRowSelectable(row) {
  if (["Admin", "super_admin"].includes(auth.role)) {
    return row.statut === "EN_ATTENTE_VERIFICATEUR";
  }
  if (auth.role === "Dispatch") {
    return ZIP_STATUSES.includes(row.statut);
  }
  return false;
}

const selectableRows = computed(() =>
  rows.value.filter((r) => isRowSelectable(r)),
);

const allSelectableSelected = computed(
  () =>
    selectableRows.value.length > 0 &&
    selectableRows.value.every((r) =>
      selectedRows.value.some((s) => s.id === r.id),
    ),
);

const someSelectableSelected = computed(() =>
  selectableRows.value.some((r) =>
    selectedRows.value.some((s) => s.id === r.id),
  ),
);

function onSelectedUpdate(next) {
  selectedRows.value = (next || []).filter((r) => isRowSelectable(r));
}

function toggleSelectAllSelectable(checked) {
  selectedRows.value = checked ? [...selectableRows.value] : [];
}

async function exportZip() {
  if (selectedIds.value.length === 0) return;
  zipLoading.value = true;
  try {
    const response = await api.post(
      "/dossiers/export-zip",
      { dossier_ids: selectedIds.value },
      { responseType: "blob" },
    );

    // Nom de fichier depuis Content-Disposition
    let filename = "dossiers_export.zip";
    const cd = response.headers?.["content-disposition"];
    const m = cd && cd.match(/filename="?([^";]+)"?/);
    if (m) {
      try {
        filename = decodeURIComponent(m[1]);
      } catch {
        filename = m[1];
      }
    }

    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    $q.notify({
      type: "positive",
      message: `${selectedIds.value.length} dossier(s) exporté(s) en ZIP.`,
    });
    selectedRows.value = [];
  } catch (e) {
    let msg = e.response?.data?.error || "Erreur lors de l'export ZIP.";
    if (e.response?.data instanceof Blob) {
      try {
        msg = JSON.parse(await e.response.data.text()).error || msg;
      } catch {
        /* réponse non JSON */
      }
    }
    $q.notify({ type: "negative", message: msg });
  } finally {
    zipLoading.value = false;
  }
}

// Batch assign
const showBatchAssignDialog = ref(false);
const batchVerificateurId = ref(null);
const batchLoading = ref(false);
const verificateurs = ref([]);
const filteredVerificateurs = ref([]);

// Context menu
const showContextMenu = ref(false);
const contextMenuAnchor = ref(null);
const contextMenuRow = ref(null);

const columns = [
  { name: "id", label: "#", field: "id", align: "left", sortable: true },
  { name: "nom", label: "Nom", field: "nom", align: "left", sortable: true },
  { name: "n_compte", label: "N° compte", field: "n_compte", align: "left" },
  { name: "n_be", label: "N° BE", field: "n_be", align: "left" },
  { name: "n_ord", label: "N° ORD", field: "n_ord", align: "left" },
  { name: "n_soa", label: "N° SOA", field: "n_soa", align: "left" },
  {
    name: "exo_budgetaire",
    label: "Exercice Budgetaire",
    field: "exo_budgetaire",
    align: "left",
  },
  { name: "statut", label: "Statut", field: "statut", align: "left" },
  {
    name: "deadline_at",
    label: "Deadline",
    field: (r) => r.deadline_at || null,
    align: "left",
  },
  {
    name: "deadline",
    label: "Délai",
    field: (r) => r.deadline_remaining_label || "—",
    align: "left",
  },
  {
    name: "updated_at",
    label: "Mis à jour",
    field: (r) => formatDate(r.updated_at),
    align: "left",
  },
  {
    name: "acteurs",
    label: "Acteurs",
    field: (r) => r,
    align: "left",
  },
  { name: "actions", label: "", field: "actions", align: "right" },
];

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleString("fr-FR");
}

function deadlineColorClass(c) {
  const map = {
    green: "text-positive",
    yellow: "text-warning",
    red: "text-negative",
    grey: "text-grey-7",
    waiting: "text-grey-7",
  };
  return map[c] || "text-grey-7";
}

function deadlineDotColor(c) {
  const map = {
    green: "#2e7d32",
    yellow: "#f9a825",
    red: "#c62828",
    grey: "#9e9e9e",
    waiting: "#f9a825",
  };
  return map[c] || "#9e9e9e";
}

function formatDeadlineAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const h = d.getHours();
  const m = d.getMinutes();
  const timePart = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  return `${datePart} à ${timePart}`;
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filters.value.q) params.q = filters.value.q;
    if (filters.value.statut) params.statut = filters.value.statut;
    const { data } = await api.get("/dossiers", { params });
    // Server marks `a_traiter` / `in_fifo` for the current user when applicable.
    // Client-side: ensure the dossier to traiter (a_traiter) appears first,
    // then those in the fifo, then the rest (stable otherwise).
    rows.value = data.sort((a, b) => {
      if ((a.a_traiter ? 1 : 0) !== (b.a_traiter ? 1 : 0)) {
        return b.a_traiter ? 1 : -1;
      }
      if ((a.in_fifo ? 1 : 0) !== (b.in_fifo ? 1 : 0)) {
        return b.in_fifo ? 1 : -1;
      }
      return 0;
    });
  } finally {
    loading.value = false;
  }
}

async function loadVerificateurs() {
  try {
    const { data } = await api.get("/users", {
      params: { role: "Verificateur", with_stats: 1 },
    });
    const admins = await api.get("/users", {
      params: { role: "Admin", with_stats: 1 },
    });
    verificateurs.value = [...data, ...admins.data].map((u) => ({
      label: `${u.prenoms} ${u.nom}`,
      value: u.id,
      im: u.im,
      nb_dossiers: u.nb_dossiers,
      en_conge: u.en_conge,
      disable: u.en_conge,
    }));
    filteredVerificateurs.value = verificateurs.value;
  } catch (e) {
    console.error("Erreur chargement vérificateurs:", e);
  }
}

function filterVerificateurs(val, update) {
  update(() => {
    const needle = (val || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // ignore les accents
    filteredVerificateurs.value = needle
      ? verificateurs.value.filter((v) =>
          v.label
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes(needle),
        )
      : verificateurs.value;
  });
}

function resetVerificateurFilter() {
  // À l'ouverture du menu déroulant : afficher toute la liste
  filteredVerificateurs.value = verificateurs.value;
}

async function batchAssign() {
  if (!batchVerificateurId.value || selectedIds.value.length === 0) return;
  batchLoading.value = true;
  try {
    const { data } = await api.post("/dossiers/batch-assign-verificateur", {
      dossier_ids: selectedIds.value,
      id_verificateur: batchVerificateurId.value,
    });
    $q.notify({
      type: "positive",
      message: `${data.assigned} dossier(s) assigné(s) au vérificateur.`,
    });
    showBatchAssignDialog.value = false;
    batchVerificateurId.value = null;
    selectedRows.value = [];
    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur assignation multiple.",
    });
  } finally {
    batchLoading.value = false;
  }
}

function onRowContextMenu(evt, row) {
  // Si le clic droit est effectué sur le vrai lien du nom du dossier,
  // on laisse Chrome afficher son menu contextuel NATIF.
  const target = evt.target instanceof Element ? evt.target : null;

  if (target?.closest(".dossier-link")) {
    return;
  }

  // Pour le reste de la ligne, on conserve notre menu personnalisé.
  evt.preventDefault();
  evt.stopPropagation();

  contextMenuRow.value = row;
  contextMenuAnchor.value = {
    x: evt.clientX,
    y: evt.clientY,
  };

  showContextMenu.value = false;

  requestAnimationFrame(() => {
    showContextMenu.value = true;
  });
}

function confirmDelete(row) {
  $q.dialog({
    title: "Supprimer le dossier",
    message: `Voulez-vous supprimer définitivement le dossier « <strong>${row.nom}</strong> » ?<br><br>Cette action est irréversible.`,
    html: true,
    cancel: { label: "Annuler", flat: true },
    ok: { label: "Supprimer", color: "negative" },
    persistent: true,
  }).onOk(async () => {
    deletingId.value = row.id;
    try {
      await api.delete(`/dossiers/${row.id}`);
      $q.notify({ type: "positive", message: "Dossier supprimé." });
      await load();
    } catch (e) {
      $q.notify({
        type: "negative",
        message: e.response?.data?.error || "Erreur suppression.",
      });
    } finally {
      deletingId.value = null;
    }
  });
}

onMounted(() => {
  load();
  if (["Admin", "super_admin"].includes(auth.role)) {
    loadVerificateurs();
  }
});
</script>

<style scoped>
.deadline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}

.dossier-link {
  color: var(--q-primary);
  text-decoration: none;
  cursor: pointer;
  font-weight: 500;
}

.dossier-link:hover {
  text-decoration: underline;
}
</style>
