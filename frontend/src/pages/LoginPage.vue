<template>
  <div class="auth-bg">
    <div class="auth-panel">
      <div class="brand-mark q-mb-xs">NUMÉRISATION <span>Dossiers</span></div>
      <p class="text-grey-7 q-mb-lg">Connexion à la plateforme de validation</p>

      <q-form @submit.prevent="onSubmit" class="q-gutter-md">
        <q-input
          v-model="email"
          type="email"
          label="Email"
          outlined
          dense
          :rules="[(val) => !!val || 'Requis']"
        />
        <q-input
          v-model="mdp"
          :type="showPwd ? 'text' : 'password'"
          label="Mot de passe"
          outlined
          dense
          :rules="[(val) => !!val || 'Requis']"
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
          label="Se connecter"
          class="full-width"
          :loading="loading"
          unelevated
        />
      </q-form>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "stores/auth";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref("");
const mdp = ref("");
const showPwd = ref(false);
const loading = ref(false);
const error = ref("");

async function onSubmit() {
  loading.value = true;
  error.value = "";
  try {
    await auth.login(email.value, mdp.value);
    router.push(route.query.redirect || { name: "dossiers" });
  } catch (e) {
    error.value = e.response?.data?.error || "Échec de connexion";
  } finally {
    loading.value = false;
  }
}
</script>
