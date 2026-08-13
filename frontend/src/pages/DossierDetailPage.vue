<template>
  <q-page padding>
    <div class="page-shell" v-if="dossier">
      <div class="row items-start justify-between q-mb-md">
        <div>
          <q-btn flat dense icon="arrow_back" label="Retour" :to="{ name: 'dossiers' }" class="q-mb-sm" />
          <h1 class="page-title">{{ dossier.nom }}</h1>
          <p class="page-sub q-mb-sm">
            <q-badge :color="statusColor(dossier.statut)" class="status-chip q-mr-sm">
              {{ statusLabel(dossier.statut) }}
            </q-badge>
            Créé le {{ formatDate(dossier.created_at) }}
          </p>
        </div>
        <div class="row q-gutter-sm">
          <q-btn outline color="primary" icon="download" label="Fichier" @click="downloadFile" />
          <q-btn color="secondary" icon="archive" label="Exporter" unelevated @click="exportZip" />
        </div>
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-md-7">
          <div class="surface-card q-mb-md">
            <div class="text-subtitle1 text-weight-bold q-mb-md">Informations</div>
            <div class="row q-col-gutter-sm">
              <div class="col-6"><div class="text-caption text-grey-7">N° compte</div><div>{{ dossier.n_compte || '—' }}</div></div>
              <div class="col-6"><div class="text-caption text-grey-7">N° BE</div><div>{{ dossier.n_be || '—' }}</div></div>
              <div class="col-6"><div class="text-caption text-grey-7">N° SOA</div><div>{{ dossier.n_soa || '—' }}</div></div>
              <div class="col-6"><div class="text-caption text-grey-7">Exercice</div><div>{{ dossier.exo_budgetaire || '—' }}</div></div>
              <div class="col-12"><div class="text-caption text-grey-7">Fichier</div><div>{{ dossier.fichier_original || '—' }}</div></div>
            </div>
          </div>

          <div class="surface-card q-mb-md">
            <div class="text-subtitle1 text-weight-bold q-mb-md">Historique des traitements</div>
            <q-timeline color="primary" v-if="dossier.traitements?.length">
              <q-timeline-entry
                v-for="t in dossier.traitements"
                :key="t.id"
                :title="`${t.type_traitement} — ${t.prenoms} ${t.nom}`"
                :subtitle="formatDate(t.date_traitement)"
                :icon="typeIcon(t.type_traitement)"
              >
                <div>{{ t.commentaire || '—' }}</div>
              </q-timeline-entry>
            </q-timeline>
            <div v-else class="text-grey-7">Aucun traitement</div>
          </div>
        </div>

        <div class="col-12 col-md-5">
          <div class="surface-card q-mb-md">
            <div class="text-subtitle1 text-weight-bold q-mb-sm">Commentaire actuel</div>
            <div class="q-mb-md" style="white-space: pre-wrap">{{ dossier.commentaire || 'Aucun' }}</div>

            <q-input
              v-model="commentaire"
              type="textarea"
              outlined
              autogrow
              label="Ajouter / modifier un commentaire"
              hint="Mentionnez un utilisateur avec @email@domaine.com"
              class="q-mb-md"
            />
            <q-btn
              outline
              color="primary"
              label="Enregistrer le commentaire"
              class="full-width q-mb-md"
              :loading="busy"
              :disable="!commentaire.trim()"
              @click="saveComment"
            />

            <!-- Vérificateur → Validateur -->
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
                label="Transmettre en validation"
                class="full-width q-mb-md"
                unelevated
                :loading="busy"
                :disable="!idValidateur"
                @click="sendValidateur"
              />
            </template>

            <!-- Validateur / Admin décision -->
            <template v-if="canDecide">
              <q-separator class="q-mb-md" />
              <div class="text-subtitle2 q-mb-sm">Décision</div>
              <div class="row q-gutter-sm q-mb-md">
                <q-btn
                  color="positive"
                  label="Valider"
                  class="col"
                  unelevated
                  :loading="busy"
                  :disable="!commentaire.trim()"
                  @click="decide('valider')"
                />
                <q-btn
                  color="negative"
                  label="Rejeter"
                  class="col"
                  unelevated
                  :loading="busy"
                  :disable="!commentaire.trim()"
                  @click="decide('rejeter')"
                />
              </div>
              <q-btn
                outline
                color="secondary"
                label="Retour au Dispatch"
                class="full-width q-mb-md"
                :loading="busy"
                :disable="!commentaire.trim()"
                @click="retourDispatch"
              />
            </template>

            <!-- Admin actions -->
            <template v-if="auth.role === 'Admin' && !canDecide">
              <q-separator class="q-mb-md" />
              <div class="text-subtitle2 q-mb-sm">Actions Admin</div>
              <div class="row q-gutter-sm">
                <q-btn color="info" label="Vérifier" class="col" unelevated :disable="!commentaire.trim()" @click="adminAction('verifier')" />
                <q-btn color="positive" label="Valider" class="col" unelevated :disable="!commentaire.trim()" @click="decide('valider')" />
                <q-btn color="negative" label="Rejeter" class="col" unelevated :disable="!commentaire.trim()" @click="decide('rejeter')" />
              </div>
            </template>
          </div>

          <div class="surface-card">
            <div class="text-subtitle2 text-weight-bold q-mb-sm">Acteurs</div>
            <div class="q-mb-sm">
              <div class="text-caption text-grey-7">Dispatch</div>
              <div>{{ actor(dossier.dispatch_prenoms, dossier.dispatch_nom, dossier.dispatch_email) }}</div>
            </div>
            <div class="q-mb-sm">
              <div class="text-caption text-grey-7">Vérificateur</div>
              <div>{{ actor(dossier.verificateur_prenoms, dossier.verificateur_nom, dossier.verificateur_email) }}</div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Validateur</div>
              <div>{{ actor(dossier.validateur_prenoms, dossier.validateur_nom, dossier.validateur_email) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner color="primary" size="40px" />
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useAuthStore } from 'stores/auth'
import { statusColor, statusLabel } from 'src/utils/status'

const route = useRoute()
const $q = useQuasar()
const auth = useAuthStore()

const dossier = ref(null)
const loading = ref(true)
const busy = ref(false)
const commentaire = ref('')
const idValidateur = ref(null)
const validateurs = ref([])

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

function actor(prenoms, nom, email) {
  if (!nom && !email) return '—'
  return `${prenoms || ''} ${nom || ''}`.trim() + (email ? ` (${email})` : '')
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

async function load() {
  loading.value = true
  try {
    const { data } = await api.get(`/dossiers/${route.params.id}`)
    dossier.value = data
    commentaire.value = data.commentaire || ''
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
    await api.post(`/dossiers/${route.params.id}/comment`, { commentaire: commentaire.value })
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
    await api.post(`/dossiers/${route.params.id}/send-validateur`, {
      id_validateur: idValidateur.value,
      commentaire: commentaire.value,
    })
    $q.notify({ type: 'positive', message: 'Dossier transmis au validateur' })
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
    await api.post(`/dossiers/${route.params.id}/decide`, {
      action,
      commentaire: commentaire.value,
    })
    $q.notify({
      type: action === 'valider' ? 'positive' : 'warning',
      message: action === 'valider' ? 'Dossier validé et archivé' : 'Dossier rejeté',
    })
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
    await api.post(`/dossiers/${route.params.id}/retour-dispatch`, {
      commentaire: commentaire.value,
    })
    $q.notify({ type: 'info', message: 'Retourné au Dispatch' })
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
    await api.post(`/dossiers/${route.params.id}/admin-action`, {
      action,
      commentaire: commentaire.value,
    })
    $q.notify({ type: 'positive', message: 'Action admin effectuée' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    busy.value = false
  }
}

async function downloadFile() {
  const res = await api.get(`/dossiers/${route.params.id}/download`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = dossier.value.fichier_original || 'dossier'
  a.click()
  URL.revokeObjectURL(url)
}

async function exportZip() {
  const res = await api.get(`/dossiers/${route.params.id}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${dossier.value.nom || 'dossier'}.zip`
  a.click()
  URL.revokeObjectURL(url)
  $q.notify({ type: 'positive', message: 'Export téléchargé' })
}

onMounted(async () => {
  await Promise.all([load(), loadValidateurs()])
})
</script>
