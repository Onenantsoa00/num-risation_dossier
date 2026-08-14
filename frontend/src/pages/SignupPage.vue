<template>
  <div class="auth-bg">
    <div class="auth-panel" style="max-width: 520px">
      <div class="brand-mark q-mb-xs">NUMÉRISATION <span>Dossiers</span></div>
      <p class="text-grey-7 q-mb-lg">Créer un compte</p>

      <q-form @submit.prevent="onSubmit" class="q-gutter-md">
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-input
              v-model="form.nom"
              label="Nom"
              outlined
              dense
              :rules="[(v) => !!v || 'Requis']"
            />
          </div>
          <div class="col-6">
            <q-input
              v-model="form.prenoms"
              label="Prénoms"
              outlined
              dense
              :rules="[(v) => !!v || 'Requis']"
            />
          </div>
        </div>
        <q-input
          v-model="form.email"
          type="email"
          label="Email"
          outlined
          dense
          :rules="[(v) => !!v || 'Requis']"
        />
        <q-input v-model="form.tel" label="Téléphone" outlined dense />
        <q-input
          v-model="form.date_naissance"
          type="date"
          label="Date de naissance"
          outlined
          dense
          stack-label
        />
        <q-select
          v-model="form.id_roles"
          :options="roleOptions"
          label="Rôle"
          outlined
          dense
          emit-value
          map-options
          :rules="[(v) => !!v || 'Requis']"
        />
        <q-input
          v-model="form.mdp"
          :type="showPwd ? 'text' : 'password'"
          label="Mot de passe"
          outlined
          dense
          :rules="[(v) => (v && v.length >= 6) || 'Min. 6 caractères']"
        >
          <template #append>
            <q-icon
              :name="showPwd ? 'visibility_off' : 'visibility'"
              class="cursor-pointer"
              @click="showPwd = !showPwd"
            />
          </template>
        </q-input>

        <q-banner v-if="error" class="bg-red-1 text-negative" rounded dense>{{
          error
        }}</q-banner>
        <q-btn
          type="submit"
          color="primary"
          label="Créer le compte"
          class="full-width"
          :loading="loading"
          unelevated
        />
      </q-form>

      <div class="q-mt-md text-center">
        Déjà inscrit ?
        <router-link
          :to="{ name: 'login' }"
          class="text-primary text-weight-medium"
          >Se connecter</router-link
        >
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref("");
const showPwd = ref(false);
const roleOptions = ref([]);

const form = reactive({
  nom: "",
  prenoms: "",
  email: "",
  tel: "",
  date_naissance: "",
  id_roles: null,
  mdp: "",
});

onMounted(async () => {
  const { data } = await api.get("/users/roles");
  roleOptions.value = data.map((r) => ({ label: r.nom, value: r.id }));
  const dispatch = data.find((r) => r.nom === "Dispatch");
  form.id_roles = dispatch?.id || data[0]?.id;
});

async function onSubmit() {
  loading.value = true;
  error.value = "";
  try {
    await auth.signup({ ...form });
    router.push({ name: "dossiers" });
  } catch (e) {
    error.value = e.response?.data?.error || "Échec inscription";
  } finally {
    loading.value = false;
  }
}
</script>
