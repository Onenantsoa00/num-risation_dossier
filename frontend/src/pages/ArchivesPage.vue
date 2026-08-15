<template>
  <q-page padding>
    <div class="page-shell">
      <!-- =========================
           TITRE
      ========================= -->
      <div class="row items-center justify-between q-mb-md">
        <div>
          <h1 class="page-title">Archives</h1>

          <p class="page-sub">Dossiers validés et archivés</p>
        </div>
      </div>

      <!-- =========================
           RECHERCHE
      ========================= -->
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

          <!-- Type de recherche -->
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

        <!-- Indication -->
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

      <!-- =========================
           TABLEAU
      ========================= -->
      <q-table
        flat
        bordered
        class="surface-card"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{
          rowsPerPage: 10,
        }"
      >
        <template #body-cell-statut="props">
          <q-td :props="props">
            <q-badge color="positive">
              {{ props.row.statut }}
            </q-badge>
          </q-td>
        </template>

        <template #body-cell-date_fin_dossier="props">
          <q-td :props="props">
            {{ formatDateOnly(props.row.date_fin_dossier) }}
          </q-td>
        </template>

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
              IM : #
              {{ props.row.archiveur_im || "—" }}
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
              :to="{
                name: 'dossier-detail',
                params: {
                  id: props.row.id_dossier,
                },
              }"
            />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";

import { api } from "boot/axios";

const rows = ref([]);
const loading = ref(false);

const search = ref("");

const searchType = ref("tous");

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

  /*{
    name: "exo_budgetaire",
    label: "Exercice",
    field: "exo_budgetaire",
    align: "left",
  },

  {
    name: "n_be",
    label: "N° BE",
    field: "n_be",
    align: "left",
  },

  {
    name: "n_ord",
    label: "N° ORD",
    field: "n_ord",
    align: "left",
  },

  {
    name: "n_compte",
    label: "N° compte",
    field: "n_compte",
    align: "left",
  },

  {
    name: "n_soa",
    label: "N° SOA",
    field: "n_soa",
    align: "left",
  },

  {
    name: "compte_pc",
    label: "Compte PC",
    field: "compte_pc",
    align: "left",
  },

  {
    name: "ref_ecriture",
    label: "Réf. écriture",
    field: "ref_ecriture",
    align: "left",
  },

  {
    name: "date_fin_dossier",
    label: "Date fin",
    field: "date_fin_dossier",
    align: "left",
  },*/

  {
    name: "archiveur",
    label: "Agent",
    field: (row) =>
      row.archiveur_nom ? `${row.archiveur_prenoms} ${row.archiveur_nom}` : "—",
    align: "left",
  },

  {
    name: "date_archivage",
    label: "Date archivage",
    field: (row) => formatDateTime(row.date_archivage),
    align: "left",
  },

  {
    name: "actions",
    label: "",
    field: "actions",
    align: "right",
  },
];

const selectedSearchLabel = computed(() => {
  return (
    searchTypeOptions.find((option) => option.value === searchType.value)
      ?.label || "Tous les champs"
  );
});

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
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
