<template>
  <div class="dossier-list-panel surface-card">
    <div class="dossier-list-panel__header">
      <q-input
        v-model="search"
        dense
        outlined
        clearable
        placeholder="Rechercher..."
        debounce="300"
        @update:model-value="$emit('search', search)"
      >
        <template #prepend><q-icon name="search" size="xs" /></template>
      </q-input>
      <q-select
        v-if="showStatutFilter"
        v-model="statut"
        :options="statutOptions"
        dense
        outlined
        clearable
        emit-value
        map-options
        label="Statut"
        class="q-mt-sm"
        @update:model-value="$emit('filter-statut', statut)"
      />
    </div>

    <q-scroll-area class="dossier-list-panel__scroll">
      <q-list separator>
        <q-item
          v-for="row in rows"
          :key="row.id || row.id_dossier"
          clickable
          v-ripple
          :active="isSelected(row)"
          active-class="dossier-list-panel__item--active"
          @click="$emit('select', row)"
        >
          <q-item-section avatar>
            <q-avatar color="primary" text-color="white" size="36px" font-size="14px">
              <q-icon name="folder" />
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium ellipsis">
              {{ row.nom || row.dossier_nom }}
            </q-item-label>
            <q-item-label caption class="ellipsis">
              {{ row.n_compte || row.motif || formatDate(row.updated_at || row.date_archivage) }}
            </q-item-label>
          </q-item-section>
          <q-item-section side top>
            <q-badge
              v-if="row.statut"
              :color="statusColor(row.statut)"
              class="status-chip"
            >
              {{ statusLabel(row.statut) }}
            </q-badge>
          </q-item-section>
        </q-item>
        <q-item v-if="!rows.length && !loading">
          <q-item-section class="text-grey-6 text-center">Aucun dossier</q-item-section>
        </q-item>
        <q-item v-if="loading">
          <q-item-section class="flex flex-center">
            <q-spinner color="primary" size="24px" />
          </q-item-section>
        </q-item>
      </q-list>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { statusColor, statusLabel, statutOptions } from 'src/utils/status'

defineProps({
  rows: { type: Array, default: () => [] },
  selectedId: { type: [Number, String], default: null },
  loading: { type: Boolean, default: false },
  showStatutFilter: { type: Boolean, default: true },
})

defineEmits(['select', 'search', 'filter-statut'])

const search = ref('')
const statut = ref(null)

function isSelected(row) {
  const id = row.id ?? row.id_dossier
  return id === props.selectedId
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR')
}

// fix props reference in isSelected
const props = defineProps({
  rows: { type: Array, default: () => [] },
  selectedId: { type: [Number, String], default: null },
  loading: { type: Boolean, default: false },
  showStatutFilter: { type: Boolean, default: true },
})
</script>
