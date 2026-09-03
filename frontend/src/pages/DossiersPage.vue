<template>
  <q-page padding>
    <div class="page-shell">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Dossiers</h1>
          <p class="page-sub">Suivi et validation des dossiers ORDSEC</p>
        </div>
        <q-btn
          v-if="['Dispatch', 'Admin'].includes(auth.role)"
          color="primary"
          icon="upload_file"
          label="Importer"
          :to="{ name: 'dossier-create' }"
          unelevated
        />
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
        @row-click="
          (_, row) =>
            $router.push({ name: 'dossier-detail', params: { id: row.id } })
        "
      >
        <template #body-cell-statut="props">
          <q-td :props="props">
            <q-badge :color="statusColor(props.row.statut)" class="status-chip">
              {{ statusLabel(props.row.statut) }}
            </q-badge>
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
              v-if="['Admin', 'super_admin'].includes(auth.role) && props.row.statut === 'REJETE'"
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
    </div>
  </q-page>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";
import { statusColor, statusLabel, statutOptions } from "src/utils/status";

const auth = useAuthStore();
const $q = useQuasar();
const rows = ref([]);
const loading = ref(false);
const filters = ref({ q: "", statut: null });
const deletingId = ref(null);

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
  { name: "actions", label: "", field: "actions", align: "right" },
];

function formatDate(d) {
  if (!d) return "-";
  return new Date(d).toLocaleString("fr-FR");
}

async function load() {
  loading.value = true;
  try {
    const params = {};
    if (filters.value.q) params.q = filters.value.q;
    if (filters.value.statut) params.statut = filters.value.statut;
    const { data } = await api.get("/dossiers", { params });
    rows.value = data;
  } finally {
    loading.value = false;
  }
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

onMounted(load);
</script>
