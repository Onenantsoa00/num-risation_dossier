// frontend/src/pages/DossierCreatePage.vue
<template>
  <q-page class="dossier-create-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Importer un dossier</h1>
        <p class="page-sub">
          Importez le dossier, renseignez ses informations puis envoyez-le aux
          administrateurs pour assignation.
        </p>
      </div>
    </div>

    <div class="create-workspace">
      <section class="preview-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">
              <q-icon name="visibility" class="q-mr-sm" />
              Aperçu du dossier
            </div>
            <div class="panel-subtitle">
              Le contenu du fichier apparaîtra ici
            </div>
          </div>
          <q-chip
            v-if="fichier"
            color="primary"
            text-color="white"
            icon="description"
            size="sm"
          >
            {{ fichier.name }}
          </q-chip>
        </div>
        <div class="preview-container">
          <DossierFilePreview :file="fichier" :can-download="false" />
        </div>
      </section>

      <section class="form-panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">
              <q-icon name="edit_document" class="q-mr-sm" />
              Informations du dossier
            </div>
            <div class="panel-subtitle">
              Complétez les informations avant l'envoi
            </div>
          </div>
        </div>

        <q-form @submit.prevent="submit" class="form-content">
          <q-input
            :model-value="nomDossier"
            label="Nom du dossier"
            outlined
            readonly
          />

          <div class="form-section-title">Informations administratives</div>

          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input v-model="nCompte" label="N° compte *" outlined />
            </div>
            <div class="col-12 col-sm-6">
              <q-input v-model="nBe" label="N° BE *" outlined />
            </div>
            <div class="col-12 col-sm-6">
              <q-input v-model="nSoa" label="N° SOA *" outlined />
            </div>
            <div class="col-12 col-sm-6">
              <q-input v-model="nOrd" label="N° ORD" outlined />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="exoBudgetaire"
                label="Exercice budgétaire *"
                outlined
              />
            </div>
          </div>

          <div class="form-section-title">Fichier du dossier</div>

          <q-file
            v-model="fichier"
            label="Sélectionner le fichier *"
            outlined
            dense
            accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.xls,.xlsx,.txt"
            :rules="[(v) => !!v || 'Le fichier est requis']"
            clearable
          >
            <template #prepend>
              <q-icon name="attach_file" />
            </template>
            <template #hint>PDF — 50 Mo maximum</template>
          </q-file>

          <q-input
            v-model="form.commentaire"
            type="textarea"
            label="Commentaire"
            outlined
            autogrow
          />

          <q-banner v-if="error" class="bg-red-1 text-negative" rounded>
            <template #avatar>
              <q-icon name="error" />
            </template>
            {{ error }}
          </q-banner>

          <div class="form-actions">
            <q-btn flat label="Annuler" :to="{ name: 'dossiers' }" />
            <q-btn
              type="submit"
              color="primary"
              icon="send"
              label="Envoyer"
              unelevated
              :loading="loading"
              :disable="!fichier"
            />
          </div>
        </q-form>
      </section>
    </div>

    <!-- Modale doublon -->
    <q-dialog v-model="duplicateDialog" persistent>
      <q-card style="width: 520px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Dossier déjà existant</div>
          <p class="q-mt-sm text-body2">
            Un dossier avec les mêmes informations existe déjà
            <template v-if="duplicateStatut === 'RETOUR_DISPATCH'">
              et est en statut <strong>Retour Dispatch</strong>.
              Voulez-vous valider ce fichier comme nouvelle version ?
            </template>
            <template v-else>
              (statut : <strong>{{ duplicateStatut }}</strong>).
              Ce dossier est déjà en cours de traitement.
            </template>
          </p>
          <p v-if="duplicateStatut === 'RETOUR_DISPATCH'" class="text-caption text-grey-7 q-mt-sm">
            Le dossier sera renvoyé en vérification au vérificateur précédemment
            assigné, avec comparaison ancien/nouveau fichier.
          </p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Annuler" v-close-popup />
          <q-btn
            v-if="duplicateStatut === 'RETOUR_DISPATCH'"
            color="primary"
            label="Valider ce fichier"
            unelevated
            :loading="loading"
            @click="confirmDuplicateReimport"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import DossierFilePreview from "components/DossierFilePreview.vue";

const router = useRouter();
const $q = useQuasar();

const loading = ref(false);
const error = ref("");
const fichier = ref(null);
const duplicateDialog = ref(false);
const duplicateDossierId = ref(null);
const duplicateStatut = ref("");

const nCompte = ref("");
const nBe = ref("");
const nSoa = ref("");
const nOrd = ref("");
const exoBudgetaire = ref("");

const nomDossier = computed(() => {
  return [exoBudgetaire.value, nBe.value, nOrd.value, nCompte.value, nSoa.value]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("_");
});

const form = reactive({ commentaire: "" });

function buildFormData() {
  const fd = new FormData();
  fd.append("nom", nomDossier.value);
  fd.append("n_compte", nCompte.value.trim());
  fd.append("n_be", nBe.value.trim());
  fd.append("n_ord", nOrd.value.trim());
  fd.append("n_soa", nSoa.value.trim());
  fd.append("exo_budgetaire", exoBudgetaire.value.trim());
  if (form.commentaire.trim()) {
    fd.append("commentaire", form.commentaire.trim());
  }
  fd.append("fichier", fichier.value);
  return fd;
}

async function submit() {
  error.value = "";

  if (!fichier.value) {
    error.value = "Veuillez sélectionner un fichier.";
    return;
  }
  if (!nCompte.value.trim() || !nBe.value.trim() || !nSoa.value.trim() || !exoBudgetaire.value.trim()) {
    error.value = "Veuillez renseigner tous les champs obligatoires.";
    return;
  }

  loading.value = true;
  try {
    const { data } = await api.post("/dossiers", buildFormData());
    $q.notify({ type: "positive", message: "Dossier envoyé aux administrateurs." });
    router.push({ name: "dossier-detail", params: { id: data.id } });
  } catch (e) {
    if (e.response?.status === 409 && e.response?.data?.code === "DUPLICATE_ACTIVE") {
      duplicateDossierId.value = e.response.data.existing_dossier_id;
      duplicateStatut.value = e.response.data.existing_dossier?.statut || "";
      duplicateDialog.value = true;
    } else if (e.response?.status === 409 && e.response?.data?.code === "DUPLICATE_RETOUR_DISPATCH") {
      duplicateDossierId.value = e.response.data.existing_dossier_id;
      duplicateStatut.value = "RETOUR_DISPATCH";
      duplicateDialog.value = true;
    } else {
      error.value = e.response?.data?.error || "Erreur lors de l'import.";
    }
  } finally {
    loading.value = false;
  }
}

async function confirmDuplicateReimport() {
  loading.value = true;
  try {
    const fd = new FormData();
    fd.append("fichier", fichier.value);
    const { data } = await api.post(
      `/dossiers/${duplicateDossierId.value}/confirm-reimport`,
      fd,
    );
    duplicateDialog.value = false;
    $q.notify({
      type: "positive",
      message: "Nouveau dossier créé — ancien dossier conservé pour comparaison.",
    });
    // Rediriger vers le nouveau dossier (côté gauche = ancien, côté droit = nouveau)
    router.push({ name: "dossier-detail", params: { id: data.new_dossier.id } });
  } catch (e) {
    error.value = e.response?.data?.error || "Erreur lors de la confirmation.";
    duplicateDialog.value = false;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.dossier-create-page {
  background: #f5f7fa;
  min-height: calc(100vh - 64px);
  padding: 24px;
}
.page-header {
  max-width: 1600px;
  margin: 0 auto 20px;
}
.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}
.page-sub {
  margin: 6px 0 0;
  color: #6b7280;
}
.create-workspace {
  max-width: 1600px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(420px, 0.65fr);
  gap: 20px;
  align-items: stretch;
  min-height: calc(100vh - 170px);
}
.preview-panel,
.form-panel {
  background: white;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  flex-shrink: 0;
}
.panel-title {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.panel-subtitle {
  color: #6b7280;
  font-size: 12px;
  margin-top: 3px;
}
.preview-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  background: #eef1f5;
}
.form-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.form-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #374151;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  margin-top: auto;
}
@media (max-width: 1000px) {
  .create-workspace {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .preview-panel {
    min-height: 600px;
  }
}
</style>
