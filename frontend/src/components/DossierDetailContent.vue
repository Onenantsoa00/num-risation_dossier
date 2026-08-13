<template>
  <div v-if="dossier" class="dossier-detail-content">
    <DossierSplitLayout mode="preview">
      <template #left>
        <DossierFilePreview
          :remote-url="previewUrl"
          :remote-name="dossier.fichier_original"
          :loading="previewLoading"
          can-download
          :metadata="previewMetadata"
          @download="downloadFile"
        />

        <div class="surface-card q-mt-md">
          <div class="text-subtitle2 text-weight-bold q-mb-sm">Historique</div>
          <q-timeline color="primary" v-if="dossier.traitements?.length" class="q-px-sm">
            <q-timeline-entry
              v-for="t in dossier.traitements"
              :key="t.id"
              :title="`${t.type_traitement} — ${t.prenoms} ${t.nom}`"
              :subtitle="formatDate(t.date_traitement)"
              :icon="typeIcon(t.type_traitement)"
            >
              <div class="text-body2">{{ t.commentaire || '—' }}</div>
            </q-timeline-entry>
          </q-timeline>
          <div v-else class="text-grey-7 text-body2">Aucun traitement</div>
        </div>
      </template>

      <template #right>
        <div class="surface-card sticky-panel">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-h6 text-weight-bold">{{ dossier.nom }}</div>
              <q-badge :color="statusColor(dossier.statut)" class="status-chip q-mt-xs">
                {{ statusLabel(dossier.statut) }}
              </q-badge>
            </div>
            <div class="row q-gutter-xs">
              <q-btn flat round dense icon="archive" color="secondary" @click="exportZip">
                <q-tooltip>Exporter ZIP</q-tooltip>
              </q-btn>
            </div>
          </div>

          <div class="text-caption text-grey-7 q-mb-md">
            Créé le {{ formatDate(dossier.created_at) }}
          </div>

          <q-separator class="q-mb-md" />

          <div class="text-subtitle2 text-weight-bold q-mb-sm">Commentaire</div>
          <div
            v-if="dossier.commentaire && dossier.commentaire !== commentaire"
            class="q-mb-sm text-body2 bg-blue-1 q-pa-sm rounded-borders"
            style="white-space: pre-wrap"
          >
            {{ dossier.commentaire }}
          </div>

          <q-input
            v-model="commentaire"
            type="textarea"
            outlined
            autogrow
            label="Votre commentaire"
            hint="Mentionnez @email@domaine.com"
            class="q-mb-sm"
          />
          <q-btn
            outline
            color="primary"
            label="Enregistrer"
            class="full-width q-mb-md"
            :loading="busy"
            :disable="!commentaire.trim()"
            @click="saveComment"
          />

          <template v-if="canSendToValidateur">
            <q-separator class="q-mb-md" />
            <div class="text-subtitle2 q-mb-sm">Envoyer au validateur</div>
            <q-select
              v-model="idValidateur"
              :options="validateurs"
              label="Validateur"
              outlined
              dense
              emit-value
              map-options
              class="q-mb-sm"
            />
            <q-btn
              color="warning"
              text-color="white"
              label="Transmettre"
              class="full-width q-mb-md"
              unelevated
              :loading="busy"
              :disable="!idValidateur"
              @click="sendValidateur"
            />
          </template>

          <template v-if="canDecide">
            <q-separator class="q-mb-md" />
            <div class="text-subtitle2 q-mb-sm">Décision</div>
            <div class="row q-gutter-sm q-mb-sm">
              <q-btn color="positive" label="Valider" class="col" unelevated :loading="busy" :disable="!commentaire.trim()" @click="decide('valider')" />
              <q-btn color="negative" label="Rejeter" class="col" unelevated :loading="busy" :disable="!commentaire.trim()" @click="decide('rejeter')" />
            </div>
            <q-btn outline color="secondary" label="Retour Dispatch" class="full-width q-mb-md" :loading="busy" :disable="!commentaire.trim()" @click="retourDispatch" />
          </template>

          <template v-if="auth.role === 'Admin' && !canDecide">
            <q-separator class="q-mb-md" />
            <div class="text-subtitle2 q-mb-sm">Admin</div>
            <div class="row q-gutter-sm">
              <q-btn color="info" label="Vérifier" class="col" unelevated :disable="!commentaire.trim()" @click="adminAction('verifier')" />
              <q-btn color="positive" label="Valider" class="col" unelevated :disable="!commentaire.trim()" @click="decide('valider')" />
              <q-btn color="negative" label="Rejeter" class="col" unelevated :disable="!commentaire.trim()" @click="decide('rejeter')" />
            </div>
          </template>

          <q-separator class="q-my-md" />

          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">Acteurs</div>
          <div class="text-body2 q-mb-xs">
            <span class="text-grey-7">Dispatch:</span>
            {{ actor(dossier.dispatch_prenoms, dossier.dispatch_nom) }}
          </div>
          <div class="text-body2 q-mb-xs">
            <span class="text-grey-7">Vérificateur:</span>
            {{ actor(dossier.verificateur_prenoms, dossier.verificateur_nom) }}
          </div>
          <div class="text-body2">
            <span class="text-grey-7">Validateur:</span>
            {{ actor(dossier.validateur_prenoms, dossier.validateur_nom) }}
          </div>
        </div>
      </template>
    </DossierSplitLayout>
  </div>
  <div v-else-if="loading" class="flex flex-center q-pa-xl">
    <q-spinner color="primary" size="40px" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useAuthStore } from 'stores/auth'
import { statusColor, statusLabel } from 'src/utils/status'
import DossierSplitLayout from 'components/DossierSplitLayout.vue'
import DossierFilePreview from 'components/DossierFilePreview.vue'

const props = defineProps({
  dossierId: { type: [Number, String], required: true },
})

const emit = defineEmits(['updated'])

const $q = useQuasar()
const auth = useAuthStore()

const dossier = ref(null)
const loading = ref(true)
const busy = ref(false)
const commentaire = ref('')
const idValidateur = ref(null)
const validateurs = ref([])
const previewUrl = ref(null)
const previewLoading = ref(false)

const previewMetadata = computed(() => {
  if (!dossier.value) return {}
  const d = dossier.value
  return {
    'N° compte': d.n_compte,
    'N° BE': d.n_be,
    'N° SOA': d.n_soa,
    Exercice: d.exo_budgetaire,
    Statut: statusLabel(d.statut),
  }
})

const canSendToValidateur = computed(() => {
  if (!dossier.value) return false
  if (!['Verificateur', 'Admin'].includes(auth.role)) return false
  return ['EN_VERIFICATION', 'RETOUR_DISPATCH'].includes(dossier.value.statut) || auth.role === 'Admin'
})

const canDecide = computed(() => {
  if (!dossier.value) return false
  if (!['Validateur', 'Admin'].includes(auth.role)) return false
  return dossier.value.statut === 'EN_VALIDATION' || auth.role === 'Admin'
})

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR')
}

function actor(prenoms, nom) {
  if (!nom && !prenoms) return '—'
  return `${prenoms || ''} ${nom || ''}`.trim()
}

function typeIcon(type) {
  return {
    DISPATCH: 'send',
    VERIFICATION: 'fact_check',
    VALIDATION: 'verified',
    REJET: 'cancel',
    RETOUR: 'undo',
  }[type] || 'info'
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
}

async function loadPreview() {
  revokePreview()
  if (!dossier.value?.fichier_original) return
  previewLoading.value = true
  try {
    const res = await api.get(`/dossiers/${props.dossierId}/download`, { responseType: 'blob' })
    previewUrl.value = URL.createObjectURL(res.data)
  } catch {
    previewUrl.value = null
  } finally {
    previewLoading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const { data } = await api.get(`/dossiers/${props.dossierId}`)
    dossier.value = data
    commentaire.value = data.commentaire || ''
    emit('updated', data)
    await loadPreview()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur chargement' })
  } finally {
    loading.value = false
  }
}

async function loadValidateurs() {
  const { data } = await api.get('/users', { params: { role: 'Validateur' } })
  const admins = await api.get('/users', { params: { role: 'Admin' } })
  validateurs.value = [...data, ...admins.data].map((u) => ({
    label: `${u.prenoms} ${u.nom} (${u.email})`,
    value: u.id,
  }))
}

async function saveComment() {
  busy.value = true
  try {
    await api.post(`/dossiers/${props.dossierId}/comment`, { commentaire: commentaire.value })
    $q.notify({ type: 'positive', message: 'Commentaire enregistré' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function sendValidateur() {
  busy.value = true
  try {
    await api.post(`/dossiers/${props.dossierId}/send-validateur`, {
      id_validateur: idValidateur.value,
      commentaire: commentaire.value,
    })
    $q.notify({ type: 'positive', message: 'Transmis au validateur' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function decide(action) {
  busy.value = true
  try {
    await api.post(`/dossiers/${props.dossierId}/decide`, { action, commentaire: commentaire.value })
    $q.notify({ type: action === 'valider' ? 'positive' : 'warning', message: action === 'valider' ? 'Validé' : 'Rejeté' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function retourDispatch() {
  busy.value = true
  try {
    await api.post(`/dossiers/${props.dossierId}/retour-dispatch`, { commentaire: commentaire.value })
    $q.notify({ type: 'info', message: 'Retour Dispatch' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function adminAction(action) {
  busy.value = true
  try {
    await api.post(`/dossiers/${props.dossierId}/admin-action`, { action, commentaire: commentaire.value })
    $q.notify({ type: 'positive', message: 'Action effectuée' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function downloadFile() {
  const res = await api.get(`/dossiers/${props.dossierId}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = dossier.value.fichier_original || 'dossier'
  a.click()
  URL.revokeObjectURL(url)
}

async function exportZip() {
  const res = await api.get(`/dossiers/${props.dossierId}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${dossier.value.nom || 'dossier'}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

watch(() => props.dossierId, load, { immediate: false })

onMounted(async () => {
  await Promise.all([load(), loadValidateurs()])
})

onUnmounted(revokePreview)

defineExpose({ reload: load })
</script>
