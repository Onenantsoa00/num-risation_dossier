<template>
  <div class="restricted-page">
    <div class="restricted-card">
      <q-icon name="lock" size="80px" color="negative" class="q-mb-lg" />

      <div class="text-h4 text-weight-bold q-mb-sm">Compte restreint</div>

      <div class="text-body1 text-grey-7 q-mb-md">
        Votre compte a été restreint.
      </div>

      <div class="text-body2 text-grey-7 q-mb-lg">
        Vous ne pouvez pas accéder à cette application pour le moment. Veuillez
        contacter l'Administrateur.
      </div>

      <q-btn
        color="primary"
        icon="logout"
        label="Retour à la connexion"
        unelevated
        @click="logout"
      />
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import { useAuthStore } from "stores/auth";

const router = useRouter();
const auth = useAuthStore();

function logout() {
  auth.logout();

  router.replace({
    name: "login",
  });
}
</script>

<style scoped>
.restricted-page {
  width: 100vw;
  min-height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;

  background: #ffffff;

  padding: 24px;
}

.restricted-card {
  width: 100%;
  max-width: 520px;

  text-align: center;

  padding: 48px 32px;
}

@media (max-width: 600px) {
  .restricted-card {
    padding: 32px 20px;
  }

  .restricted-card .text-h4 {
    font-size: 28px;
  }
}
</style>
