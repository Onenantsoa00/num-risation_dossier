<template>
  <div class="auth-bg">
    <div class="auth-panel">
      <div class="brand-mark q-mb-xs">NUMÉRISATION <span>Dossiers</span></div>
      <p class="text-grey-7 q-mb-lg">Connexion à la plateforme de validation</p>

      <q-form @submit.prevent="onSubmit" class="q-gutter-md">
        <q-input
          v-model="cin"
          label="CIN"
          outlined
          dense
          maxlength="12"
          :rules="[(val) => !!val || 'Le CIN est requis']"
        >
          <template #prepend>
            <q-icon name="badge" />
          </template>
        </q-input>
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

        <q-banner
          v-if="route.query.reason === 'inactivity'"
          class="bg-orange-1 text-orange-10 q-mb-sm"
          rounded
          dense
        >
          Session expirée après 15 minutes d'inactivité. Veuillez vous reconnecter.
        </q-banner>

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

const cin = ref("");
const mdp = ref("");
const showPwd = ref(false);
const loading = ref(false);
const error = ref("");

async function onSubmit() {
  loading.value = true;
  error.value = "";

  try {
    await auth.login(cin.value.trim(), mdp.value);

    router.push(
      route.query.redirect || {
        name: "dossiers",
      },
    );
  } catch (e) {
    if (
      e.response?.status === 403 &&
      e.response?.data?.code === "ACCOUNT_RESTRICTED"
    ) {
      router.push({
        name: "account-restricted",
      });

      return;
    }

    error.value = e.response?.data?.error || "Échec de connexion";
  } finally {
    loading.value = false;
  }
}
</script>
