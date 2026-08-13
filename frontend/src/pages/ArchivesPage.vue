<template>
  <q-page padding>
    <div class="page-shell">
      <h1 class="page-title">Archives</h1>
      <p class="page-sub">Dossiers validés et archivés automatiquement</p>

      <q-table
        flat
        bordered
        class="surface-card"
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="{ rowsPerPage: 10 }"
      >
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              :to="{ name: 'dossier-detail', params: { id: props.row.id_dossier } }"
            />
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from 'boot/axios'

const rows = ref([])
const loading = ref(false)

const columns = [
  { name: 'id', label: '#', field: 'id', align: 'left' },
  { name: 'dossier_nom', label: 'Dossier', field: 'dossier_nom', align: 'left' },
  {
    name: 'archiveur',
    label: 'Archivé par',
    field: (r) => (r.archiveur_nom ? `${r.archiveur_prenoms} ${r.archiveur_nom}` : '—'),
    align: 'left',
  },
  {
    name: 'date_archivage',
    label: 'Date',
    field: (r) => new Date(r.date_archivage).toLocaleString('fr-FR'),
    align: 'left',
  },
  { name: 'motif', label: 'Motif', field: 'motif', align: 'left' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

onMounted(async () => {
  loading.value = true
  try {
    const { data } = await api.get('/archives')
    rows.value = data
  } finally {
    loading.value = false
  }
})
</script>
