<template>
  <q-page padding>
    <div class="page-shell" style="max-width: 640px">
      <h1 class="page-title">Mon profil</h1>
      <p class="page-sub">Modifier vos informations personnelles</p>

      <div class="surface-card">
        <div class="row items-center q-mb-lg q-gutter-md">
          <q-avatar size="72px" color="primary" text-color="white">
            <img v-if="preview || auth.user?.image" :src="preview || auth.user.image" />
            <span v-else>{{ initials }}</span>
          </q-avatar>
          <div>
            <div class="text-h6">{{ auth.fullName }}</div>
            <div class="text-grey-7">{{ auth.role }} · {{ auth.user?.email }}</div>
          </div>
        </div>

        <q-form @submit.prevent="save" class="q-gutter-md">
          <div class="row q-col-gutter-md">
            <div class="col-6">
              <q-input v-model="form.nom" label="Nom" outlined dense />
            </div>
            <div class="col-6">
              <q-input v-model="form.prenoms" label="Prénoms" outlined dense />
            </div>
          </div>
          <q-input v-model="form.email" type="email" label="Email" outlined dense />
          <q-input v-model="form.tel" label="Téléphone" outlined dense />
          <q-input v-model="form.date_naissance" type="date" label="Date de naissance" outlined dense stack-label />
          <q-file v-model="imageFile" label="Photo de profil" outlined dense accept="image/*" @update:model-value="onImage">
            <template #prepend><q-icon name="image" /></template>
          </q-file>
          <q-input v-model="form.mdp" type="password" label="Nouveau mot de passe (optionnel)" outlined dense />

          <q-btn type="submit" color="primary" label="Enregistrer" unelevated :loading="loading" class="full-width" />
        </q-form>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useAuthStore } from 'stores/auth'

const auth = useAuthStore()
const $q = useQuasar()
const loading = ref(false)
const imageFile = ref(null)
const preview = ref(null)

const form = reactive({
  nom: '',
  prenoms: '',
  email: '',
  tel: '',
  date_naissance: '',
  mdp: '',
})

const initials = computed(() => {
  if (!auth.user) return '?'
  return `${auth.user.prenoms?.[0] || ''}${auth.user.nom?.[0] || ''}`.toUpperCase()
})

onMounted(() => {
  if (!auth.user) return
  form.nom = auth.user.nom || ''
  form.prenoms = auth.user.prenoms || ''
  form.email = auth.user.email || ''
  form.tel = auth.user.tel || ''
  form.date_naissance = auth.user.date_naissance
    ? String(auth.user.date_naissance).slice(0, 10)
    : ''
})

function onImage(file) {
  if (!file) {
    preview.value = null
    return
  }
  preview.value = URL.createObjectURL(file)
}

async function save() {
  loading.value = true
  try {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => {
      if (v) fd.append(k, v)
    })
    if (imageFile.value) fd.append('image', imageFile.value)

    const { data } = await api.put('/users/profile', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    auth.updateUser(data.user)
    form.mdp = ''
    $q.notify({ type: 'positive', message: 'Profil mis à jour' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.response?.data?.error || 'Erreur' })
  } finally {
    loading.value = false
  }
}
</script>
