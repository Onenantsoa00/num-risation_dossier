<template>
  <q-page padding>
    <div class="page-shell">
      <div class="row items-center justify-between q-mb-md">
        <div>
          <q-btn
            flat
            dense
            icon="arrow_back"
            label="Retour"
            :to="{ name: 'dossiers' }"
            class="q-mb-sm"
          />

          <h1 class="page-title">Détail du dossier</h1>

          <p class="page-sub">Consultation et traitement du dossier</p>
        </div>
      </div>

      <DossierDetailContent :dossier-id="route.params.id" />
    </div>
  </q-page>
</template>

<script setup>
import { useRoute } from "vue-router";
import DossierDetailContent from "components/DossierDetailContent.vue";

const route = useRoute();
</script>
